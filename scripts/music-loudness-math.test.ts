/**
 * 一起听音量均衡：响度/增益换算的单测（node --test 原生运行）。
 *
 * 只覆盖纯函数与积分器；Web Audio（captureStream / IIR / analyser）依赖真实
 * 浏览器，走页面验收。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  GAIN_DEADBAND_DB,
  INTEGRATE_TAU_MS,
  LoudnessAccumulator,
  MIN_GAIN_DB,
  SILENCE_GATE_LUFS,
  dbToGain,
  gainToDb,
  kWeightingCoefficients,
  meanSquareToLufs,
  smoothGain,
  targetGainFromLufs,
} from '../src/upstream/modules/music/audio/loudness.ts'

describe('meanSquareToLufs', () => {
  it('满幅均方为 -0.691 LUFS', () => {
    assert.ok(Math.abs(meanSquareToLufs(1) - -0.691) < 1e-9)
  })

  it('每降 10 倍能量降 10 LU', () => {
    assert.ok(Math.abs(meanSquareToLufs(0.01) - -20.691) < 1e-9)
  })

  it('无信号返回 -Infinity', () => {
    assert.equal(meanSquareToLufs(0), Number.NEGATIVE_INFINITY)
    assert.equal(meanSquareToLufs(-1), Number.NEGATIVE_INFINITY)
    assert.equal(meanSquareToLufs(Number.NaN), Number.NEGATIVE_INFINITY)
  })
})

describe('targetGainFromLufs（只衰减不提升）', () => {
  it('正好等于目标时增益为 1', () => {
    assert.ok(Math.abs(targetGainFromLufs(-14) - 1) < 1e-9)
  })

  it('比目标更轻时也不提升', () => {
    assert.equal(targetGainFromLufs(-20), 1)
    assert.equal(targetGainFromLufs(Number.NEGATIVE_INFINITY), 1)
  })

  it('比目标更响时按差值衰减', () => {
    // -8 → 目标 -14 → -6 dB
    assert.ok(Math.abs(targetGainFromLufs(-8) - dbToGain(-6)) < 1e-9)
  })

  it('衰减量受下限夹取', () => {
    assert.ok(Math.abs(targetGainFromLufs(0) - dbToGain(MIN_GAIN_DB)) < 1e-9)
  })

  it('自定义目标响度生效', () => {
    assert.ok(Math.abs(targetGainFromLufs(-10, -16) - dbToGain(-6)) < 1e-9)
  })
})

describe('smoothGain', () => {
  it('dt=0 时保持原值', () => {
    assert.equal(smoothGain(1, 0.5, 0), 1)
  })

  it('按时间常数逼近目标且不越界', () => {
    const tau = 2000
    const oneTau = smoothGain(1, 0.5, tau, tau)
    // 一个时间常数走完约 63.2%
    assert.ok(Math.abs(oneTau - (1 - 0.5 * (1 - Math.exp(-1)))) < 1e-9)
    assert.ok(oneTau > 0.5 && oneTau < 1)
  })

  it('连续推进单调趋近目标', () => {
    let gain = 1
    for (let i = 0; i < 100; i++) gain = smoothGain(gain, 0.5, 100, 2000)
    assert.ok(gain < 0.53 && gain >= 0.5)
  })
})

describe('LoudnessAccumulator', () => {
  it('静音块被门限丢弃', () => {
    const acc = new LoudnessAccumulator()
    // 1e-6 → -60.7 LUFS，低于 SILENCE_GATE_LUFS
    assert.equal(acc.push(1e-6, 100), false)
    assert.equal(acc.measuredMs, 0)
    assert.equal(acc.lufs, Number.NEGATIVE_INFINITY)
  })

  it('持续同一能量水平时收敛到该响度', () => {
    const acc = new LoudnessAccumulator()
    const ms = 0.02 // -17.68 LUFS
    for (let i = 0; i < 200; i++) acc.push(ms, 100)
    assert.ok(Math.abs(acc.lufs - meanSquareToLufs(ms)) < 1e-6)
    // 累计时长有上限（用于「是否已收敛」判断）
    assert.equal(acc.measuredMs, INTEGRATE_TAU_MS * 4)
  })

  it('能量突变后按时间常数缓慢跟随', () => {
    const acc = new LoudnessAccumulator()
    for (let i = 0; i < 100; i++) acc.push(0.02, 100)
    const before = acc.lufs
    acc.push(0.2, 100) // 突然变响 10 dB
    const after = acc.lufs
    assert.ok(after > before)
    // 单块只走一小步：仍明显低于新能量对应的响度
    assert.ok(after < meanSquareToLufs(0.2) - 5)
  })

  it('reset 后回到未测量状态', () => {
    const acc = new LoudnessAccumulator()
    acc.push(0.02, 100)
    acc.reset()
    assert.equal(acc.measuredMs, 0)
    assert.equal(acc.lufs, Number.NEGATIVE_INFINITY)
  })

  it('门限以下不推进累计时长', () => {
    const acc = new LoudnessAccumulator()
    assert.ok(meanSquareToLufs(1e-6) < SILENCE_GATE_LUFS)
    acc.push(1e-6, 500)
    assert.equal(acc.measuredMs, 0)
    acc.push(0.02, 100)
    assert.equal(acc.measuredMs, 100)
  })
})

describe('kWeightingCoefficients', () => {
  // BS.1770-4 给出的 48 kHz 标准系数
  const expected = {
    shelf: [1.53512485958697, -2.69169618940638, 1.19839281085285],
    shelfA: [-1.69065929318241, 0.73248077421585],
    highpass: [1, -2, 1],
    highpassA: [-1.99004745483398, 0.99007225036621],
  }

  it('48 kHz 下与标准系数一致', () => {
    const { shelf, highpass } = kWeightingCoefficients(48000)
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(shelf.feedforward[i] - expected.shelf[i]) < 1e-3)
      assert.ok(Math.abs(highpass.feedforward[i] - expected.highpass[i]) < 1e-9)
    }
    for (let i = 0; i < 2; i++) {
      assert.ok(Math.abs(shelf.feedback[i + 1] - expected.shelfA[i]) < 1e-3)
      assert.ok(
        Math.abs(highpass.feedback[i + 1] - expected.highpassA[i]) < 1e-3
      )
    }
  })

  it('反馈首项恒为 1（已归一化）', () => {
    for (const sr of [44100, 48000, 96000]) {
      const { shelf, highpass } = kWeightingCoefficients(sr)
      assert.equal(shelf.feedback[0], 1)
      assert.equal(highpass.feedback[0], 1)
    }
  })

  it('非法采样率回落到 48 kHz', () => {
    const a = kWeightingCoefficients(0)
    const b = kWeightingCoefficients(48000)
    assert.deepEqual(a, b)
  })
})

describe('gain 换算', () => {
  it('dB 与线性增益互逆', () => {
    for (const db of [-12, -6, -3, 0]) {
      assert.ok(Math.abs(gainToDb(dbToGain(db)) - db) < 1e-9)
    }
  })

  it('0 增益的 dB 为 -Infinity', () => {
    assert.equal(gainToDb(0), Number.NEGATIVE_INFINITY)
  })

  it('死区常量在合理范围（0.1–1 dB）', () => {
    assert.ok(GAIN_DEADBAND_DB >= 0.1 && GAIN_DEADBAND_DB <= 1)
  })
})
