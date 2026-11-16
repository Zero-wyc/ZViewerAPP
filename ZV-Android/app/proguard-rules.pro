# Capacitor plugins and WebView entry points are invoked by reflection.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault,Signature,InnerClasses,EnclosingMethod
-keep public class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }

# gomobile and WebRTC use names embedded in native libraries.
-keep class go.** { *; }
-keep class mobile.** { *; }
-keep class org.webrtc.** { *; }
# WebRTC JNI_OnLoad resolves these helper classes by name, outside Java calls.
-keep class org.jni_zero.** { *; }
-keepclasseswithmembernames,includedescriptorclasses class * { native <methods>; }
