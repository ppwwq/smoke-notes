import Foundation
import Network
import UniformTypeIdentifiers

final class LocalAssetServer {
    private static let port: NWEndpoint.Port = 38431
    private static let authority = "127.0.0.1:\(port.rawValue)"
    static let origin = URL(string: "http://\(authority)")!

    private static let headerLimit = 16 * 1024
    private static let headerEnd = Data("\r\n\r\n".utf8)

    private let listener: NWListener
    private let queue = DispatchQueue(label: "app.jotday.assets")
    private let root: URL

    init(root: URL) throws {
        self.root = root.resolvingSymlinksInPath().standardizedFileURL
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: Self.port)
        parameters.requiredInterfaceType = .loopback
        listener = try NWListener(using: parameters)
    }

    func start(completion: @escaping @Sendable (Result<Void, Error>) -> Void) {
        listener.newConnectionHandler = { [queue, root] connection in
            guard case .hostPort(let host, _) = connection.endpoint, host == .ipv4(.loopback) else {
                connection.cancel()
                return
            }

            connection.start(queue: queue)
            queue.asyncAfter(deadline: .now() + .seconds(5)) { [weak connection] in
                connection?.cancel()
            }
            Self.receive(connection, root: root, header: Data())
        }
        listener.stateUpdateHandler = { [weak listener] state in
            let result: Result<Void, Error>
            switch state {
            case .ready:
                result = .success(())
            case .failed(let error), .waiting(let error):
                result = .failure(error)
            case .cancelled:
                result = .failure(CancellationError())
            default:
                return
            }
            listener?.stateUpdateHandler = nil
            completion(result)
        }
        listener.start(queue: queue)
    }

    func stop() {
        listener.cancel()
    }

    deinit {
        stop()
    }

    private static func receive(_ connection: NWConnection, root: URL, header: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: headerLimit - header.count) {
            data, _, isComplete, error in
            guard error == nil else {
                connection.cancel()
                return
            }

            var received = header
            if let data { received.append(data) }
            if let end = received.range(of: headerEnd) {
                let reply = response(to: received[..<end.lowerBound], root: root)
                send(reply, over: connection)
            } else if received.count == headerLimit {
                send(Response(status: "431 Request Header Fields Too Large"), over: connection)
            } else if isComplete {
                connection.cancel()
            } else {
                receive(connection, root: root, header: received)
            }
        }
    }

    private struct Response {
        let status: String
        var type = "text/plain; charset=utf-8"
        var data = Data()
        var headOnly = false
    }

    private static func response(to header: Data, root: URL) -> Response {
        guard let request = String(data: header, encoding: .ascii) else {
            return Response(status: "400 Bad Request")
        }
        let lines = request.components(separatedBy: "\r\n")
        let firstLine = lines[0].split(separator: " ", omittingEmptySubsequences: false)
        guard firstLine.count == 3, firstLine[2] == "HTTP/1.1" else {
            return Response(status: "400 Bad Request")
        }
        let headOnly = firstLine[0] == "HEAD"
        guard headOnly || firstLine[0] == "GET" else {
            return Response(status: "405 Method Not Allowed")
        }

        var hasHost = false
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":"), colon != line.startIndex,
                  !line[..<colon].contains(where: \.isWhitespace) else {
                return Response(status: "400 Bad Request", headOnly: headOnly)
            }
            if line[..<colon].lowercased() == "host" {
                let value = String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
                guard !hasHost, value == authority else {
                    return Response(status: "400 Bad Request", headOnly: headOnly)
                }
                hasHost = true
            }
        }
        guard hasHost else {
            return Response(status: "400 Bad Request", headOnly: headOnly)
        }

        let target = String(firstLine[1].prefix { $0 != "?" })
        guard let path = target.removingPercentEncoding, path.hasPrefix("/"), !path.hasPrefix("//"),
              !path.contains("\\"), !path.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains) else {
            return Response(status: "400 Bad Request", headOnly: headOnly)
        }
        let components = path.split(separator: "/")
        guard components.allSatisfy({ $0 != "." && $0 != ".." }) else {
            return Response(status: "403 Forbidden", headOnly: headOnly)
        }

        let relativePath = path == "/" ? "index.html" : components.joined(separator: "/")
        let file = root.appendingPathComponent(relativePath).resolvingSymlinksInPath().standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"),
              (try? file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true,
              let data = try? Data(contentsOf: file, options: .mappedIfSafe) else {
            return Response(status: "404 Not Found", headOnly: headOnly)
        }
        return Response(status: "200 OK", type: mimeType(file), data: data, headOnly: headOnly)
    }

    private static func mimeType(_ file: URL) -> String {
        let suffix = file.pathExtension.lowercased()
        switch suffix {
        case "html": return "text/html; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "js", "mjs": return "application/javascript; charset=utf-8"
        case "json": return "application/json"
        case "webmanifest": return "application/manifest+json"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        default: return UTType(filenameExtension: suffix)?.preferredMIMEType ?? "application/octet-stream"
        }
    }

    private static func send(_ response: Response, over connection: NWConnection) {
        let lines = [
            "HTTP/1.1 \(response.status)",
            "Content-Type: \(response.type)",
            "Content-Length: \(response.data.count)",
            "Connection: close",
            "Cache-Control: no-cache",
            "Cross-Origin-Resource-Policy: same-origin",
            "X-Content-Type-Options: nosniff",
            "X-Frame-Options: DENY",
        ] + (response.status.hasPrefix("405") ? ["Allow: GET, HEAD"] : [])
        var payload = Data((lines.joined(separator: "\r\n") + "\r\n\r\n").utf8)
        if !response.headOnly { payload.append(response.data) }
        connection.send(content: payload, contentContext: .finalMessage, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
}
