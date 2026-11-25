# BiliBS · Bili Big Screen

面向 Android TV 和电视盒子的第三方哔哩哔哩客户端。电视启动器默认进入在线首页。桌面调试版与电视安装包共用界面、遥控器交互、数据模型和播放器。

## 安装和运行

- **Android TV**　安装交付的 BiliBS-TV-1.0.0.apk。也可执行 `adb install -r BiliBS-TV-1.0.0.apk`，然后在电视应用列表打开 BiliBS。目标为 Android TV 8.0 及以上及可更新的 Android System WebView；实际画质和编码取决于设备与片源。
- **Windows 项目目录**　源码压缩包自带 BiliBS 顶层目录。将包解压至 `C:\Work\Codes\Src\TV` 即可得到 `C:\Work\Codes\Src\TV\BiliBS`。在该目录执行 `python tools/dev_server.py --port 8765`，打开 `http://127.0.0.1:8765/`。桌面开发服务使用 Python 3.10 或更新版本的标准库。
- **冻结 UI 评审**　在相同地址后加 `?mode=demo`。内嵌片单、账号与短片仅用于演示；线上数据与演示数据分开保存。遥控方向键移动，确定进入，返回逐层退出，菜单键或键盘 M 打开上下文操作。
- **打开实际账号**　在「我的」左栏进入登录，在自己的手机上确认平台二维码即可授权。Android 凭据由系统密钥库保护；桌面调试服务在当前服务进程内保存会话。注销清除本设备会话，本机观看历史可单独管理。

## 源码与构建

| 入口 | 作用 |
| --- | --- |
| `index.html`、`src/boot.js`、`src/ui.css` | 本地资源启动与界面样式 |
| `src/app.js`、`src/features/` | 第六稿交互外壳及内容发现、个人中心、播放器的在线实现 |
| `src/runtime.js` | 两端使用的组装产物。运行 `python tools/build_ui.py` 更新，`--check` 可验证与源文件一致 |
| `src/services.js`、`src/transport.js` | 服务端数据归一化，应用到受信宿主的请求契约 |
| `src/vendor/` | 本地 Shaka Player、hls.js、mpegts.js 与各自许可证 |
| `tools/dev_server.py`、`android/` | 桌面回环服务、Android TV 工程与原生网络和生命周期 |
| `baseline/UI-V6.html`、`baseline/SHA256.txt` | 冻结原稿和完整性校验值 |

在具备 Android SDK Platform 35、Build Tools 35.0.0 和 JDK 的计算机上运行 `python tools/build_android.py` 重建 APK。Android Studio 可打开 android 目录。交付安装包使用开发签名；自行发布或持续签名升级的配置见 [Android 工程说明](android/README.md)。

## 验收与文档

- [本次实施验收报告](docs/BiliBS-Acceptance.html) 记录实测环境、全屏像素差异、在线控件尺寸、真实播放样本、功能追踪和未签收项。
- [需求规格说明书](docs/BiliBS-Requirements.html) 固定视觉、焦点、动效及 99 项需求。[立项可行性验证](docs/BiliBS-Feasibility.html) 是实施前的验证记录。[服务契约](api-contract.md) 对应本次开发。
- 完整受控回归需要 Node.js 18+、Python、Playwright、Pillow、FFmpeg/FFprobe、可用的 Chromium；二维码解码测试还需系统 ZBar。执行 `python tools/verify_release.py --browser /path/to/chrome --visual`。Chrome headless shell 可附加 `--single-process`。
- 实网复验入口包括 `verification/services_browser_online.py`、`verification/discovery_check.py --live-art`、`verification/player_platform_probe.py` 及账号配对检查。测试生成临时扫码及只读网络请求，记录脱敏结果。当前地区、片源、实际账号和设备会改变可得内容。
- `verification/evidence/` 保留逐项机器可读观测。涉及账号写入的受控用例、匿名实网响应和设备侧结果分别记录；模拟数据测试不会改动用户的 B 站账号。
