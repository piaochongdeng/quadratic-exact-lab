/*
 * quadratic-exact-lab · MainActivity
 * ------------------------------------------------------------------
 * 极简 WebView 壳：把 assets/ 里的网页原样装进原生应用。
 * 计算逻辑一行都没改，全部来自与网页版 / 桌面版共用的同一套 JS。
 *
 * 刻意不使用 AndroidX / AppCompat：
 *   · 依赖越少，构建越稳（不用为一个纯离线应用下载一长串 Maven 依赖）
 *   · 主题直接用系统 Theme.Material.Light.NoActionBar
 *
 * 刻意不申请任何权限：
 *   · 页面完全离线，用不到 INTERNET
 *   · 导出走 MediaStore（API 29+）或应用自己的外部目录，不需要存储权限
 * ------------------------------------------------------------------
 */
package cn.piaochong.quadraticexactlab;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebChromeClient.FileChooserParams;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/index.html";
    private static final int REQ_PICK_FILE = 0x5101;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        /* 只给 debuggable 构建开 WebView 远程调试：
           adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
           之后就能用 Chrome DevTools / CDP 检查真实 WebView 里的页面。
           release 包不会开，避免把调试端口暴露出去。 */
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        /* Android 15（API 35）起默认 edge-to-edge，安全区由网页里的
           env(safe-area-inset-*) 处理，这里不需要额外代码。 */
        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(0xFFF4F2EE);   /* 与网页浅色主题底色一致，避免启动闪白/闪黑 */

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          /* 工作区记忆用的是 localStorage */
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        /* file:// 页面读同目录的 vendor/ 字体与脚本，必须允许跨文件访问 */
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(false);
        s.setSupportZoom(false);               /* 缩放交给网页自己处理（画布双指捏合） */
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);                    /* 不跟随系统字体缩放，避免布局被撑坏 */
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                /* 站内（file:///android_asset 与锚点）自己处理，其它一律交给系统浏览器 */
                if ("file".equals(scheme) || "about".equals(scheme) || "data".equals(scheme)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                    Toast.makeText(MainActivity.this, "没有可以打开该链接的应用", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                return true;   /* 不打日志到 logcat，保持干净 */
            }

            /* 网页里 <input type="file">（「载入数据」按钮）需要壳这侧接住并弹系统选择器 */
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                }
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_PICK_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    toast("没有可以打开文件选择器的应用");
                    return false;
                }
                return true;
            }
        });

        /* 网页里的导出按钮通过 window.QuadAndroid 调到这里 */
        web.addJavascriptInterface(new Bridge(), "QuadAndroid");

        setContentView(web);
        web.loadUrl(START_URL);
    }

    /* ================= 原生桥 =================
       只暴露导出 / 剪贴板 / 打印三件事，够网页版那几个按钮用。

       注意：所有 @JavascriptInterface 方法都跑在 WebView 的 JavaBridge 线程上，
       弹 Toast / 开打印对话框必须切回主线程。 */
    private class Bridge {

        /** 让网页判断「我现在跑在 Android 壳里」，从而绑上原生按钮 */
        @JavascriptInterface
        public boolean isAndroid() {
            return true;
        }

        @JavascriptInterface
        public String platform() {
            return "android-" + Build.VERSION.SDK_INT;
        }

        @JavascriptInterface
        public String versionName() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "?";
            }
        }

        /** 复制到系统剪贴板 */
        @JavascriptInterface
        public void copy(final String text) {
            if (text == null) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("二次函数精确解析器", text));
                    toast("已复制到剪贴板");
                }
            });
        }

        /**
         * 保存文件到「下载」目录。
         * API 29+ 走 MediaStore（不需要任何权限）；更低版本回落到应用自己的外部目录。
         *
         * @param name    文件名，如 二次函数解析报告.md
         * @param mime    如 text/markdown、image/png
         * @param content Base64 编码的文件内容（二进制安全，文本也走这里）
         */
        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String content) {
            final String safeName = (name == null || name.trim().isEmpty()) ? "quadratic-exact-lab.txt" : name;
            final String safeMime = (mime == null || mime.trim().isEmpty()) ? "application/octet-stream" : mime;
            final byte[] data;
            try {
                data = Base64.decode(content == null ? "" : content, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                runOnUiThread(new Runnable() {
                    @Override public void run() { toast("导出失败：内容不是合法的 Base64"); }
                });
                return;
            }

            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        String where = writeToDownloads(safeName, safeMime, data);
                        toast("已保存到 " + where);
                    } catch (Exception e) {
                        toast("导出失败：" + e.getClass().getSimpleName());
                    }
                }
            });
        }

        /** 调起系统打印（用户可选「另存为 PDF」） */
        @JavascriptInterface
        public void printPage() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        String job = getString(R.string.app_name);
                        PrintDocumentAdapter adapter = web.createPrintDocumentAdapter(job);
                        pm.print(job, adapter, new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build());
                    } catch (Exception e) {
                        toast("打印不可用：" + e.getClass().getSimpleName());
                    }
                }
            });
        }

        /** 轻提示：网页里 toast() 已经有自己的样式，这里只在原生侧兜底用 */
        @JavascriptInterface
        public void toastMsg(final String msg) {
            runOnUiThread(new Runnable() {
                @Override public void run() { toast(msg == null ? "" : msg); }
            });
        }
    }

    /** 写文件，返回给用户看的位置描述 */
    private String writeToDownloads(String name, String mime, byte[] data) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
            cv.put(MediaStore.Downloads.MIME_TYPE, mime);
            cv.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (uri == null) throw new Exception("无法在下载目录创建文件");
            OutputStream os = getContentResolver().openOutputStream(uri);
            if (os == null) throw new Exception("无法打开输出流");
            try {
                os.write(data);
                os.flush();
            } finally {
                os.close();
            }
            cv.clear();
            cv.put(MediaStore.Downloads.IS_PENDING, 0);
            getContentResolver().update(uri, cv, null, null);
            return "下载/" + name;
        }

        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) dir = getFilesDir();
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("无法创建目录");
        File out = new File(dir, name);
        FileOutputStream fos = new FileOutputStream(out);
        try {
            fos.write(data);
            fos.flush();
        } finally {
            fos.close();
        }
        return out.getAbsolutePath();
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    /* ================= 返回键 ================= */

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_PICK_FILE) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(
                        FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("QuadAndroid");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
