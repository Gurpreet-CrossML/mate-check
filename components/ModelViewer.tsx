import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { AVATAR_HTML } from './avatarHtml';

const MODEL = require('../assets/models/model.glb');

export type AvatarAction = 'wave' | 'dance' | 'thumbsUp';

export interface ModelViewerHandle {
  playAction: (name: AvatarAction) => void;
}

interface ModelViewerProps {
  onReady?: () => void;
  amplitudeRef?: React.MutableRefObject<number>;
}

export const ModelViewer = forwardRef<ModelViewerHandle, ModelViewerProps>(
  ({ onReady, amplitudeRef }, ref) => {
    const webRef = useRef<WebView>(null);
    const [html, setHtml] = useState<string | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        playAction: (name) => {
          // Names are typed and not user-supplied, so a simple template is safe.
          webRef.current?.injectJavaScript(
            "window.playAction && window.playAction('" + name + "'); true;"
          );
        },
      }),
      []
    );

    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const asset = Asset.fromModule(MODEL);
          await asset.downloadAsync();
          const uri = asset.localUri ?? asset.uri;
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          if (cancelled) return;
          setHtml(AVATAR_HTML.replace('__MODEL_BASE64__', base64));
        } catch (e) {
          console.warn('[ModelViewer] failed to read model:', e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []);

    useEffect(() => {
      if (!html) return;
      const id = setInterval(() => {
        const amp = amplitudeRef?.current ?? 0;
        webRef.current?.injectJavaScript(
          'window.setAmplitude && window.setAmplitude(' + amp + '); true;'
        );
      }, 33);
      return () => clearInterval(id);
    }, [html, amplitudeRef]);

    if (!html) return <View style={styles.container} />;

    return (
      <View style={styles.container}>
        <WebView
          ref={webRef}
          source={{ html }}
          style={styles.web}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          androidLayerType="hardware"
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          onMessage={(event) => {
            try {
              const msg = JSON.parse(event.nativeEvent.data);
              if (msg.type === 'ready') onReady?.();
              else if (msg.type === 'log') console.log('[Avatar]', msg.message);
              else if (msg.type === 'error') console.warn('[Avatar]', msg.message);
            } catch {}
          }}
        />
      </View>
    );
  }
);

ModelViewer.displayName = 'ModelViewer';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  web: { flex: 1, backgroundColor: '#ffffff' },
});
