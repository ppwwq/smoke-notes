import UIKit
import WebKit

@main
final class JotdayApp: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        configurationForConnecting session: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
        configuration.delegateClass = JotdaySceneDelegate.self
        return configuration
    }
}

final class JotdaySceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = JotdayViewController()
        self.window = window
        window.makeKeyAndVisible()
    }
}

private final class JotdayViewController: UIViewController, WKNavigationDelegate {
    private var assetServer: LocalAssetServer?
    private var darkStatusBar = true
    private let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())

    override var preferredStatusBarStyle: UIStatusBarStyle {
        darkStatusBar ? .darkContent : .lightContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.navigationDelegate = self
        webView.configuration.userContentController.add(JotdayMessageHandler(host: self), name: "jotday")
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isHidden = true
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if assetServer == nil && presentedViewController == nil {
            start()
        }
    }

    private func start() {
        webView.isHidden = true
        guard let assets = Bundle.main.url(forResource: "Web", withExtension: nil),
              FileManager.default.fileExists(atPath: assets.appendingPathComponent("index.html").path) else {
            showError("应用缺少网页资源。")
            return
        }
        do {
            let server = try LocalAssetServer(root: assets)
            assetServer = server
            server.start { [weak self] result in
                Task { @MainActor in
                    switch result {
                    case .success:
                        self?.loadHome()
                    case .failure:
                        self?.assetServer = nil
                        self?.showError("无法启动本地页面。", retry: true)
                    }
                }
            }
        } catch {
            showError("无法启动本地页面。", retry: true)
        }
    }

    private func loadHome() {
        webView.load(URLRequest(url: LocalAssetServer.origin))
    }

    private func showError(_ message: String, retry: Bool = false) {
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(title: "Jotday", message: message, preferredStyle: .alert)
        if retry {
            alert.addAction(UIAlertAction(title: "重试", style: .default) { [weak self] _ in
                guard let self else { return }
                if self.assetServer == nil {
                    self.start()
                } else {
                    self.loadHome()
                }
            })
        } else {
            alert.addAction(UIAlertAction(title: "确定", style: .default))
        }
        present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction
    ) async -> WKNavigationActionPolicy {
        if let url = action.request.url, Self.isAppOrigin(url) {
            guard action.targetFrame == nil else { return .allow }
            webView.load(action.request)
            return .cancel
        }
        if action.targetFrame?.isMainFrame != false,
           action.navigationType == .linkActivated || action.targetFrame == nil {
            openExternalURL(action.request.url)
        }
        return .cancel
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        showError("无法载入 Jotday。", retry: true)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loadHome()
    }

    fileprivate func receive(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, Self.isAppOrigin(url),
              let body = message.body as? [String: Any],
              let method = body["method"] as? String,
              let args = body["args"] as? [Any] else { return }

        switch method {
        case "onAppReady":
            webView.isHidden = false
        case "setSystemBarTheme":
            guard args.count == 2, let hex = args[0] as? String, let dark = args[1] as? Bool else { return }
            if hex.hasPrefix("#"), hex.count == 7, let value = UInt32(hex.dropFirst(), radix: 16) {
                view.backgroundColor = UIColor(
                    red: CGFloat((value >> 16) & 255) / 255,
                    green: CGFloat((value >> 8) & 255) / 255,
                    blue: CGFloat(value & 255) / 255,
                    alpha: 1
                )
            }
            darkStatusBar = dark
            setNeedsStatusBarAppearanceUpdate()
        case "haptic":
            switch args.first as? String {
            case "longPress":
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case "confirm":
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "reject":
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            default:
                UISelectionFeedbackGenerator().selectionChanged()
            }
        case "saveTextFile":
            guard args.count == 3, let filename = args[0] as? String, let content = args[2] as? String else { return }
            shareTextFile(filename: filename, content: content)
        case "hideKeyboard":
            webView.endEditing(true)
        case "openExternalUrl":
            if let value = args.first as? String {
                openExternalURL(URL(string: value))
            }
        default:
            break
        }
    }

    private static func isAppOrigin(_ url: URL) -> Bool {
        let origin = LocalAssetServer.origin
        return url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port
    }

    private func openExternalURL(_ url: URL?) {
        guard let url, let scheme = url.scheme, ["http", "https"].contains(scheme),
              url.host != nil, !Self.isAppOrigin(url) else { return }
        UIApplication.shared.open(url)
    }

    private func shareTextFile(filename: String, content: String) {
        guard presentedViewController == nil else { return }
        let name = (filename as NSString).lastPathComponent
        guard !name.isEmpty, name != ".", name != "..", name != "/" else { return }
        let files = FileManager.default
        let folder = files.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let file = folder.appendingPathComponent(name)
        do {
            try files.createDirectory(at: folder, withIntermediateDirectories: false)
            try Data(content.utf8).write(to: file, options: .atomic)
        } catch {
            try? files.removeItem(at: folder)
            showError("无法导出文件。")
            return
        }
        let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        if let popover = share.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        share.completionWithItemsHandler = { _, _, _, _ in
            try? FileManager.default.removeItem(at: folder)
        }
        present(share, animated: true)
    }
}

@MainActor
private final class JotdayMessageHandler: NSObject, WKScriptMessageHandler {
    weak var host: JotdayViewController?

    init(host: JotdayViewController) {
        self.host = host
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        host?.receive(message)
    }
}
