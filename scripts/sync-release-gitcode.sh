#!/usr/bin/env bash
#
# 把 GitHub 上最新的（或指定版本的）Release 镜像到 GitCode 的 ZViewerAPP-Release 仓库。
#
# 为什么需要这条路径：Release 附件实际由 objects.githubusercontent.com 提供，国内直连
# 经常超时或断流。这里把安装包与清单平铺到 GitCode 仓库根目录，用户打开
#   https://gitcode.com/Zero-wyc/ZViewerAPP-Release
# 就能直接下载；脚本或客户端也可以读同目录的 latest.json 拿版本号与校验和。
#
# 做法照 ZViewer 主项目的 scripts/mirror-release-repo.sh：
#   1. 先预检 GitCode 侧可达且有写权限，别等传完 30MB 才发现 token 过期；
#   2. 幂等：GitCode 上已是这个 tag、且每个附件字节数都对得上，就直接跳过，零流量；
#   3. 每次重建一个孤儿提交覆盖推送，仓库不会因为历次安装包堆积而膨胀；
#   4. 推完回读 refs 与文件字节数，对不上就报错；
#   5. 失败按原因给结论（镜像仓只读 / 认证失败 / 超时 / 分支保护），不甩一整段 git 报错。
#
# 用法：
#   GITCODE_TOKEN=xxx bash scripts/sync-release-gitcode.sh
#   GITCODE_TOKEN=xxx TAG=client-v2.6.2 bash scripts/sync-release-gitcode.sh
#   GITCODE_TOKEN=xxx FORCE=1 bash scripts/sync-release-gitcode.sh
#   DRY_RUN=1 bash scripts/sync-release-gitcode.sh            # 只下载与组装，不推送
#
# 环境变量：
#   GITCODE_TOKEN    必需，对 GitCode 目标仓库有写权限的私人令牌
#   TAG              可选，版本号（如 client-v2.6.2）；留空取 GitHub 的 /releases/latest
#   FORCE            可选，1 = 不做幂等短路，无条件重推
#   DRY_RUN          可选，1 = 不推送、不回读，只把生成物留在临时目录里看一眼
#   TARGET_REPO      可选，默认 Zero-wyc/ZViewerAPP-Release
#   TARGET_BRANCH    可选，默认 main
#   SOURCE_REPO      可选，默认 Zero-wyc/ZViewerAPP
#   GH_TOKEN         可选，GitHub 令牌；CI 里传 GITHUB_TOKEN 可提高 API 限额
#   VERIFY_MIRROR    可选，默认 1：推完回读 refs、清单与各文件字节数
#   VERIFY_SHA256SUMS 可选，默认 1：Release 里带 SHA256SUMS.txt 时按它校验下载物

set -euo pipefail

if [ "${DRY_RUN:-0}" = "1" ]; then
  GITCODE_TOKEN="${GITCODE_TOKEN:-dry-run}"
elif [ -z "${GITCODE_TOKEN:-}" ]; then
  echo "::error::缺少 GITCODE_TOKEN：需要一枚对 GitCode 目标仓库有写权限的私人令牌"
  exit 1
fi
GITCODE_USER="${GITCODE_USER:-Zero-wyc}"
TARGET_REPO="${TARGET_REPO:-${GITCODE_USER}/ZViewerAPP-Release}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
SOURCE_REPO="${SOURCE_REPO:-Zero-wyc/ZViewerAPP}"
API_BASE="${API_BASE:-https://api.github.com}"
TAG="${TAG:-}"
FORCE="${FORCE:-0}"
DRY_RUN="${DRY_RUN:-0}"
VERIFY_MIRROR="${VERIFY_MIRROR:-1}"
VERIFY_SHA256SUMS="${VERIFY_SHA256SUMS:-1}"
VERIFY_POLL_ATTEMPTS="${VERIFY_POLL_ATTEMPTS:-12}"
VERIFY_POLL_SECONDS="${VERIFY_POLL_SECONDS:-10}"
MIRROR_PUSH_URL="${MIRROR_PUSH_URL:-https://${GITCODE_USER}:${GITCODE_TOKEN}@gitcode.com/${TARGET_REPO}.git}"
MIRROR_RAW_BASE="${MIRROR_RAW_BASE:-https://api.gitcode.com/api/v5/repos/${TARGET_REPO}/raw}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "::error::缺少命令 $1"
    exit 1
  }
}
need curl
need git
need jq

mask() { sed -e "s|${GITCODE_TOKEN}|***|g" -e 's|https://[^@/]*@|https://***@|g'; }

file_size() { wc -c <"$1" | tr -d ' '; }

file_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

json_tag() {
  [ -n "${1:-}" ] || return 0
  jq -r '.tag // empty' <<<"$1" 2>/dev/null || true
}

gh_get() {
  local path="$1"
  local -a hdr=(-H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28')
  if [ -n "${GH_TOKEN:-}" ]; then
    hdr+=(-H "Authorization: Bearer ${GH_TOKEN}")
  fi
  curl -fsS -m 45 "${hdr[@]}" "${API_BASE}${path}"
}

remote_manifest() {
  curl -fsS -m 20 "${MIRROR_RAW_BASE}/latest.json?ref=${TARGET_BRANCH}" 2>/dev/null || true
}

# 只用 1KB 的 Range 请求读 Content-Range，不整包下载就知道远端字节数。
remote_size() {
  curl -fsS -m 30 -r 0-1023 -o /dev/null -D - "${MIRROR_RAW_BASE}/$1?ref=${TARGET_BRANCH}" 2>/dev/null \
    | tr -d '\r' | awk -F'/' 'tolower($1) ~ /content-range/ {print $2; exit}'
}

remote_sha() {
  git ls-remote "${MIRROR_PUSH_URL}" "refs/heads/${TARGET_BRANCH}" 2>/dev/null | awk '{print $1; exit}'
}

# ---- 1. 预检：地址、令牌、写权限 ----
# 空仓库是正常状态（第一次同步），ls-remote 成功但没有 ref 就算通过。
echo "== 预检 gitcode.com/${TARGET_REPO}（${TARGET_BRANCH}）"
if [ "${DRY_RUN}" = "1" ]; then
  echo "== DRY_RUN=1，跳过预检"
elif ! probe=$(GIT_TERMINAL_PROMPT=0 git ls-remote "${MIRROR_PUSH_URL}" 2>&1 >/dev/null); then
  printf '%s\n' "${probe}" | mask
  echo "::error::连不上 GitCode 的 ${TARGET_REPO}：确认仓库地址存在、GITCODE_TOKEN 未过期，且账号对该仓库有写权限。"
  exit 1
fi

# ---- 2. 解析要同步的 Release ----
if [ -z "${TAG}" ]; then
  echo "== 读取 GitHub 最新正式版（/releases/latest）"
  if ! release_json=$(gh_get "/repos/${SOURCE_REPO}/releases/latest"); then
    echo "::error::读不到 ${SOURCE_REPO} 的最新 Release：确认仓库有已发布的正式版，或显式指定 TAG。"
    exit 1
  fi
else
  echo "== 读取 GitHub Release ${TAG}"
  if ! release_json=$(gh_get "/repos/${SOURCE_REPO}/releases/tags/${TAG}"); then
    echo "::error::GitHub 上找不到 tag 为 ${TAG} 的 Release。"
    exit 1
  fi
fi

TAG=$(jq -r '.tag_name // empty' <<<"${release_json}")
if [ -z "${TAG}" ]; then
  echo "::error::Release 数据里没有 tag_name"
  exit 1
fi
if [ "$(jq -r '.draft // false' <<<"${release_json}")" = "true" ]; then
  echo "::error::${TAG} 还是草稿，GitHub 上草稿的附件对外不可下载，先发布再同步。"
  exit 1
fi
if [ "$(jq -r '.prerelease // false' <<<"${release_json}")" = "true" ]; then
  echo "::warning::${TAG} 是预发布版，将按你指定的版本照常镜像。"
fi

VERSION=$(sed -nE 's/^client-v([0-9]+\.[0-9]+\.[0-9]+)$/\1/p' <<<"${TAG}")
VERSION="${VERSION:-${TAG#client-v}}"
RELEASE_NAME=$(jq -r '.name // empty' <<<"${release_json}")
RELEASE_URL=$(jq -r '.html_url // empty' <<<"${release_json}")
PUBLISHED_AT=$(jq -r '.published_at // empty' <<<"${release_json}")

# 附件名要当文件名用，先卡死字符集，顺便挡掉路径穿越。
ASSET_NAMES=()
INSTALLERS=0
while IFS= read -r name; do
  [ -n "${name}" ] || continue
  if ! [[ "${name}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    echo "::error::附件名不合规，拒绝落盘：${name}"
    exit 1
  fi
  ASSET_NAMES+=("${name}")
  case "${name}" in
    *.apk | *.hap | *.ipa) INSTALLERS=$((INSTALLERS + 1)) ;;
  esac
done < <(jq -r '.assets[]?.name // empty' <<<"${release_json}")

if [ "${#ASSET_NAMES[@]}" -eq 0 ]; then
  echo "::error::${TAG} 没有任何附件，没什么可镜像的。"
  exit 1
fi
if [ "${INSTALLERS}" -eq 0 ]; then
  echo "::error::${TAG} 的附件里没有 .apk / .hap / .ipa，确认这是客户端的 Release。"
  exit 1
fi

echo "== 目标版本：${TAG}（${#ASSET_NAMES[@]} 个附件）"

asset_size_of() {
  jq -r --arg n "$1" '.assets[]? | select(.name == $n) | .size // empty' <<<"${release_json}" | head -1
}

# ---- 3. 幂等：GitCode 上已经是这一版就不动 ----
# 只比 size 不比 sha256：size 已经能挡住「清单新、附件旧」这种断流中间态，而逐个拉
# 29MB 回来算哈希，等于把省下的流量又花回去。
if [ "${FORCE}" != "1" ] && [ "${DRY_RUN}" != "1" ]; then
  GH_REMOTE_MANIFEST=$(remote_manifest)
  if [ -n "${GH_REMOTE_MANIFEST}" ] && [ "$(json_tag "${GH_REMOTE_MANIFEST}")" = "${TAG}" ]; then
    synced=1
    for name in "${ASSET_NAMES[@]}"; do
      want=$(asset_size_of "${name}")
      got=$(remote_size "${name}")
      if [ "${got}" != "${want}" ]; then
        echo "== ${name} 远端 ${got:-读不到} / 期望 ${want}，需要重推"
        synced=0
        break
      fi
    done
    if [ "${synced}" = "1" ]; then
      echo "== GitCode 上已经是 ${TAG}，附件字节数一致，无需同步（要强制覆盖用 FORCE=1）"
      exit 0
    fi
  fi
fi

# ---- 4. 下载附件并校验 ----
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
ASSETS_DIR="${WORK}/downloads"
REPO_DIR="${WORK}/repo"
mkdir -p "${ASSETS_DIR}" "${REPO_DIR}"

for name in "${ASSET_NAMES[@]}"; do
  want=$(asset_size_of "${name}")
  url=$(jq -r --arg n "${name}" '.assets[]? | select(.name == $n) | .browser_download_url // empty' <<<"${release_json}" | head -1)
  if [ -z "${url}" ]; then
    echo "::error::${name} 没有下载地址"
    exit 1
  fi
  echo "== 下载 ${name}（${want} 字节）"
  # 单个大包在跨境链路上可能很慢：给足 1 小时总时长，只有「连续 5 分钟低于 1KB/s」
  # 才判定停滞重试，避免下到一半被一个过紧的 max-time 掐断。
  if ! curl -fL -sS --retry 5 --retry-all-errors --retry-delay 3 \
    --max-time 3600 --speed-limit 1024 --speed-time 300 \
    -o "${ASSETS_DIR}/${name}" "${url}"; then
    echo "::error::下载 ${name} 失败（GitHub 附件链路超时或被限流，稍后重跑即可）"
    exit 1
  fi
  got=$(file_size "${ASSETS_DIR}/${name}")
  if [ "${got}" != "${want}" ]; then
    echo "::error::${name} 实际 ${got} 字节，Release 声明 ${want} 字节，下载不完整"
    exit 1
  fi
done

if [ "${VERIFY_SHA256SUMS}" = "1" ] && [ -f "${ASSETS_DIR}/SHA256SUMS.txt" ]; then
  if (cd "${ASSETS_DIR}" && sha256sum --ignore-missing -c SHA256SUMS.txt >/dev/null 2>&1); then
    echo "== SHA256SUMS.txt 校验通过"
  else
    echo "::error::SHA256SUMS.txt 与实际下载物对不上，停止同步"
    exit 1
  fi
fi

# ---- 5. 组装仓库工作树：附件 + latest.json + README ----
cp -f "${ASSETS_DIR}"/* "${REPO_DIR}"/

ASSETS_JSON='[]'
for name in "${ASSET_NAMES[@]}"; do
  # 清单文件本身不进 assets 列表，否则 latest.json 会指向一份"校验文件的校验和"。
  if [ "${name}" = "SHA256SUMS.txt" ]; then
    continue
  fi
  size=$(file_size "${REPO_DIR}/${name}")
  sha=$(file_sha256 "${REPO_DIR}/${name}")
  url="${MIRROR_RAW_BASE}/${name}?ref=${TARGET_BRANCH}"
  ASSETS_JSON=$(jq -c --arg n "${name}" --argjson s "${size}" --arg h "${sha}" --arg u "${url}" \
    '. + [{name: $n, size: $s, sha256: $h, url: $u}]' <<<"${ASSETS_JSON}")
done

jq -n \
  --arg tag "${TAG}" \
  --arg version "${VERSION}" \
  --arg name "${RELEASE_NAME}" \
  --arg publishedAt "${PUBLISHED_AT}" \
  --arg releaseUrl "${RELEASE_URL}" \
  --argjson assets "${ASSETS_JSON}" \
  '{
    tag: $tag,
    version: $version,
    name: $name,
    publishedAt: $publishedAt,
    releaseUrl: $releaseUrl,
    generatedAt: (now | todate),
    assets: $assets
  }' >"${REPO_DIR}/latest.json"

HAS_IPA=0
for name in "${ASSET_NAMES[@]}"; do
  case "${name}" in *.ipa) HAS_IPA=1 ;; esac
done
IOS_LINE=''
if [ "${HAS_IPA}" = "1" ]; then
  IOS_LINE='
- iOS：需自备证书对未签名 IPA 重签后侧载，不能直接点击安装。'
fi

# 发行说明原文，方便在 GitCode 页面直接看这次改了什么。
NOTES=$(jq -r '.body // ""' <<<"${release_json}")
if [ -n "${NOTES}" ]; then
  printf '%s\n' "${NOTES}" >"${REPO_DIR}/RELEASE-NOTES.md"
else
  printf '上游 Release 未填写发行说明，请到 %s 查看。\n' "${RELEASE_URL}" >"${REPO_DIR}/RELEASE-NOTES.md"
fi

cat >"${REPO_DIR}/README.md" <<EOF
# ZViewer 客户端 Release 镜像

本仓库由 GitHub Actions 从 [${SOURCE_REPO}](https://github.com/${SOURCE_REPO}) 的 Release 自动镜像，**请勿直接向本仓库提交**。

- 当前镜像版本：\`${TAG}\`${RELEASE_NAME:+（${RELEASE_NAME}）}
- 上游发行页：${RELEASE_URL}
- 时间：${PUBLISHED_AT}
- 清单：\`latest.json\`，含每个安装包的字节数与 SHA256
- 校验：\`SHA256SUMS.txt\`
- 发行说明：\`RELEASE-NOTES.md\`

## 安装提示

- Android：ARM64（arm64-v8a），Android 7.0 / API 24 及以上；允许安装未知来源后直接安装 APK。
- HarmonyOS：HarmonyOS 6.1 / API 23 及以上；HAP 需用 DevEco Studio、HDC 等开发者方式安装，签名与设备授权需匹配。${IOS_LINE}

安装包来源、签名与发行说明以上游 Release 为准。
EOF

ls -l "${REPO_DIR}" | sed -n '2,20p'

if [ "${DRY_RUN}" = "1" ]; then
  echo "== DRY_RUN=1，未推送。生成物在 ${REPO_DIR}"
  cat "${REPO_DIR}/latest.json"
  exit 0
fi

# ---- 6. 重建孤儿提交（只保留这一份快照，历史不累积安装包） ----
git -C "${REPO_DIR}" init -q -b "${TARGET_BRANCH}"
git -C "${REPO_DIR}" config user.name "github-actions[bot]"
git -C "${REPO_DIR}" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git -C "${REPO_DIR}" add -A
git -C "${REPO_DIR}" commit -qm "release: ${TAG}"
LOCAL_SHA=$(git -C "${REPO_DIR}" rev-parse HEAD)

# ---- 7. 推送（带超时与重试） ----
push_mirror() {
  local attempt=1
  while [ "${attempt}" -le 3 ]; do
    echo "== 推送第 ${attempt}/3 次：gitcode.com/${TARGET_REPO}@${TARGET_BRANCH}（${LOCAL_SHA:0:7}）"
    if PUSH_LOG=$(git -C "${REPO_DIR}" \
      -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=120 \
      push --force --quiet "${MIRROR_PUSH_URL}" "${TARGET_BRANCH}:${TARGET_BRANCH}" 2>&1); then
      return 0
    fi
    printf '%s\n' "${PUSH_LOG}" | mask
    attempt=$((attempt + 1))
    if [ "${attempt}" -le 3 ]; then
      sleep $((attempt * 10))
    fi
  done
  return 1
}

echo "== 推送到 GitCode ${TARGET_REPO}@${TARGET_BRANCH}"
if ! push_mirror; then
  if printf '%s' "${PUSH_LOG}" | grep -qiE 'image repository|CH\.00905403'; then
    echo "::warning::GitCode 的 ${TARGET_REPO} 是只读镜像仓（开了 Pull 镜像），平台拒绝推送。请到项目设置 → 仓库镜像 关闭 Pull 镜像后重试。"
    exit 0
  elif printf '%s' "${PUSH_LOG}" | grep -qiE 'protected|hook|pre-receive'; then
    echo "::error::目标分支 ${TARGET_BRANCH} 受保护或服务端钩子拒收：到 GitCode 项目设置里允许强制推送（或改用其它分支）。"
  elif printf '%s' "${PUSH_LOG}" | grep -qiE 'authentication|403|401|denied|permission'; then
    echo "::error::GitCode 认证/权限失败：确认 Secret GITCODE_TOKEN 有效，且账号对 ${TARGET_REPO} 有写权限。"
  elif printf '%s' "${PUSH_LOG}" | grep -qiE 'low speed limit|timed out|timeout'; then
    echo "::error::推送超时或速率过低（跨境链路当时传不动）。脚本幂等，链路恢复后原样重跑即可。"
  else
    echo "::error::推送 GitCode 失败（已重试 3 次）"
  fi
  exit 1
fi

if [ "${VERIFY_MIRROR}" != "1" ]; then
  echo "== 已推送（未回读校验）"
  exit 0
fi

# ---- 8. 回读：refs 精确一致，清单 tag 与文件字节数也要对得上 ----
GOT_SHA=$(remote_sha || true)
if [ "${GOT_SHA}" != "${LOCAL_SHA}" ]; then
  echo "::error::回读不一致：gitcode ${TARGET_BRANCH} = ${GOT_SHA:-（空）}，期望 ${LOCAL_SHA}"
  exit 1
fi
echo "== refs 已对齐：${GOT_SHA:0:7}"

# 文件接口有缓存，轮询到新 tag 出现为止（最多 ~2 分钟）；推成功但读得慢只告警。
GOT_TAG=''
for _ in $(seq 1 "${VERIFY_POLL_ATTEMPTS}"); do
  GOT_TAG=$(json_tag "$(remote_manifest)")
  [ "${GOT_TAG}" = "${TAG}" ] && break
  sleep "${VERIFY_POLL_SECONDS}"
done
if [ "${GOT_TAG}" != "${TAG}" ]; then
  echo "::warning::文件接口读到的 latest.json 还是 ${GOT_TAG:-读不到}（期望 ${TAG}），git 侧已推送成功，稍后复查：${MIRROR_RAW_BASE}/latest.json?ref=${TARGET_BRANCH}"
  exit 0
fi

ok=0
bad=0
for name in "${ASSET_NAMES[@]}"; do
  want=$(file_size "${REPO_DIR}/${name}")
  got=$(remote_size "${name}")
  if [ "${got}" = "${want}" ]; then
    echo "   ${name}  ${got} 字节 ✅"
    ok=$((ok + 1))
  else
    echo "   ${name}  远端 ${got:-?} / 期望 ${want} ❌"
    bad=$((bad + 1))
  fi
done
if [ "${bad}" -gt 0 ]; then
  echo "::warning::有 ${bad} 个附件字节数对不上，可能还没同步完；稍后用同一入口再跑一次即可"
  exit 0
fi

echo "== 已同步：gitcode.com/${TARGET_REPO} ${TARGET_BRANCH}=${LOCAL_SHA:0:7} tag=${TAG}（${ok} 个附件字节数一致）"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### GitCode 镜像已更新"
    echo
    echo "| 项 | 值 |"
    echo "| --- | --- |"
    echo "| 版本 | \`${TAG}\` |"
    echo "| 仓库 | [${TARGET_REPO}](https://gitcode.com/${TARGET_REPO}) |"
    echo "| 提交 | \`${LOCAL_SHA:0:7}\` |"
    echo "| 附件 | ${#ASSET_NAMES[@]} 个，字节数全部一致 |"
    echo
    echo "下载页：https://gitcode.com/${TARGET_REPO}"
  } >>"${GITHUB_STEP_SUMMARY}"
fi
