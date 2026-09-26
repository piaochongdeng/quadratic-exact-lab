// quadratic-exact-lab · app 模块混淆规则
//
// 目前 release 构建刻意关闭了 R8（见 build.gradle），
// 这份规则是为了「以后想开的时候」能一键打开而不踩坑。

# WebView 的原生桥：@JavascriptInterface 标注的方法会被 R8 当成无人调用而删掉，
# 删掉后网页调 window.QuadAndroid.xxx() 会静默失效（很难查）。
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class cn.piaochong.quadraticexactlab.MainActivity$Bridge {
    public *;
}
