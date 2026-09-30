import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
export async function pickTextFile(maxBytes = 4 * 1024 * 1024): Promise<{ name: string; text: string; uri: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0]; if (asset.size && asset.size > maxBytes) throw new Error('导入文件过大');
  let text: string;
  if (Platform.OS === 'web') { if (!asset.file) throw new Error('浏览器未提供文件'); text = await asset.file.text(); }
  else { const file = new File(asset.uri); if (file.size > maxBytes) throw new Error('导入文件过大'); text = await file.text(); }
  if (text.length > maxBytes) throw new Error('导入文本过大');
  return { name: asset.name, text, uri: asset.uri };
}
