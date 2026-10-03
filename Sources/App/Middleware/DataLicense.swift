import Vapor

/// Stamps every successful read with the licence of the data it carries.
///
/// The legal page says the data is ODbL and the photos CC BY-SA 4.0, but whoever
/// scrapes `/fonts/in-bounds` never sees that page. With these headers the terms
/// travel with the bytes, so "we didn't know" stops being an argument.
///
/// Only on 2xx GET/HEAD: a licence on an error body or a write acknowledgement
/// says nothing. `Link` with `rel="license"` is the registered relation (RFC 4946);
/// the attribution string is the one the legal page asks for.
struct DataLicenseMiddleware: AsyncMiddleware {
    static let dataLicense = "https://opendatacommons.org/licenses/odbl/"
    static let photoLicense = "https://creativecommons.org/licenses/by-sa/4.0/"
    static let terms = "https://fontapp.net/legal"
    static let attribution = "FontApp y sus colaboradores; OpenStreetMap (ODbL); ICGC/ACA (CC BY 4.0)"

    func respond(to request: Request, chainingTo next: AsyncResponder) async throws -> Response {
        let response = try await next.respond(to: request)
        guard request.method == .GET || request.method == .HEAD,
              (200..<300).contains(response.status.code) else { return response }
        response.headers.add(name: "Link", value: "<\(Self.dataLicense)>; rel=\"license\"; title=\"ODbL 1.0 (data)\"")
        response.headers.add(name: "Link", value: "<\(Self.photoLicense)>; rel=\"license\"; title=\"CC BY-SA 4.0 (photos)\"")
        response.headers.add(name: "Link", value: "<\(Self.terms)>; rel=\"terms-of-service\"")
        response.headers.replaceOrAdd(name: "X-Data-License", value: "ODbL-1.0")
        response.headers.replaceOrAdd(name: "X-Attribution", value: Self.attribution)
        return response
    }
}
