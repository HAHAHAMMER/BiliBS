# BiliBS Android TV

应用标识为 `tv.bilibs.app`，版本为 1.0.0。安装包适用于有 Android System WebView 的 Android TV 8.0（API 26）及以上设备。网页界面使用现代 Chromium 的 JavaScript、CSS 和 Media Source Extensions。老电视的 WebView 版本、片源编码以及硬件解码能力会影响实际可用功能。

## 编译与安装

在项目根目录使用 Python 3.10+、JDK 17 或 21 与 Android SDK。SDK Manager 需安装 `platforms;android-35`、`build-tools;35.0.0`、`platform-tools`。设置 `ANDROID_HOME` 指向 SDK 根目录。

```sh
python tools/build_android.py
adb install -r android/build/outputs/apk/BiliBS.apk
adb shell am start -n tv.bilibs.app/.TvActivity
```

也可用 `--sdk` 指定 SDK，用 `--out` 指定输出。标准构建会从 src/app.js 和三个功能模块生成同一份运行脚本，递归打包 src 和 assets，并执行 zipalign 及 apksigner 验证。默认签名密钥是当前构建机用户的 `.android/bilibs-development.keystore`。在另一台构建机上更新同一设备的安装版本，需要使用原安装包的签名密钥。

自行分发时传入 `--keystore /path/to/signing.jks --alias YOUR_ALIAS`。构建程序从 `BILIBS_STORE_PASSWORD` 读取口令，独立的密钥口令可放在 `BILIBS_KEY_PASSWORD`。源代码包中不包含签名密钥。Android Studio 可直接打开 android 目录，Gradle Wrapper 与 SDK 构建命令共用网页资源组装步骤。在 android 目录可运行 `gradlew.bat :app:assembleDebug`（Windows）或 `./gradlew :app:assembleDebug`（Linux/macOS）。

## 遥控器与评审入口

电视启动器打开线上首页。方向键移动焦点，确定触发当前动作，菜单键打开上下文操作。返回键先关闭弹层或回到上一层。在首页顶栏的「首页」上再按返回，退出到电视桌面。长按方向键连续移动，其余动作每次按下只触发一次。实体键盘仍可输入文本。应用退到后台时，预览及正片暂停，播放位置由与桌面共用的进度逻辑保存。

在开发设备上可用下列命令打开离线验收素材。正式账号数据与离线样本使用独立的存储键。

```sh
adb shell am force-stop tv.bilibs.app
adb shell am start -n tv.bilibs.app/.TvActivity --ez demo true
```

## 运行结构

- TvActivity 托管横屏全屏 WebView，把遥控器事件转交给页面，并在销毁时释放连接和 WebView。源码与桌面一致，按 1440 × 810 设计坐标等比缩放。
- LocalAppClient 提供打包页面的本地 HTTPS 原点。内容策略仅允许打包脚本运行，禁止嵌入网页和跳出应用。海报与视频可经 HTTPS 加载。
- NetworkBridge 异步提交请求。TrustedNetwork 负责接口白名单、会话、媒体令牌、Range 与 HLS 资源，凭据持久化使用 Android Keystore。Shaka 与 WebView 媒体栈处理受支持的媒体格式。
- 测试构建可传 `--debuggable` 开启 WebView 远程检查。常规命令生成的 APK 关闭该检查。

## 在设备上重放冒烟测试

安装测试依赖 `pip install "websockets>=15"`，连接已开启 adb 的 Android TV 或 Android TV 模拟器。以下命令重新安装同签名 QA 包，并检查电视启动、遥控器逐级移动、整幅横幅换片、作品详情返回以及退出。指定设备可设置环境变量 `ANDROID_SERIAL`。脚本将设备的 WebView 调试套接字转发到本机的临时 TCP 端口，检查完成后撤销转发。

```sh
python tools/build_android.py --debuggable --out android/build/BiliBS-qa.apk
python tools/check_android.py --apk android/build/BiliBS-qa.apk --out android/build/qa
```
