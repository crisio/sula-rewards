# Modelos de la API (kotlinx.serialization): se guardan sus serializadores y nombres.
-keepattributes *Annotation*, InnerClasses, Signature, EnclosingMethod
-keep class com.cristopherpineda.sularewards.core.** { *; }
-keepclassmembers class com.cristopherpineda.sularewards.** {
    *** Companion;
}
-keepclasseswithmembers class com.cristopherpineda.sularewards.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Credential Manager con Google (lo recomienda la documentación de androidx.credentials).
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** {
  *;
}
