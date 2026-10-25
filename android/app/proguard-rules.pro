# window.ToojibeeAndroid (the app's and the hidden page's bridges, MainActivity
# and PhoneActions): the page calls these methods by name.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}