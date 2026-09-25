import XCTest
@testable import App

final class WaterRecoveryTests: XCTestCase {
    func testRequiresExplicitTransitionFromNoWater() {
        for before in ["dry", "broken", "gone"] {
            XCTAssertTrue(WaterRecovery.isRecovery(previous: before, current: "flowing"))
            XCTAssertTrue(WaterRecovery.isRecovery(previous: before, current: "trickle"))
        }
        for before: String? in [nil, "unknown", "flowing", "trickle"] {
            XCTAssertFalse(WaterRecovery.isRecovery(previous: before, current: "flowing"))
        }
        XCTAssertFalse(WaterRecovery.isRecovery(previous: "dry", current: nil))
        XCTAssertFalse(WaterRecovery.isRecovery(previous: "dry", current: "unknown"))
        XCTAssertTrue(FontWatchNotifier.Change.recovered(status: "flowing").urgente)
        XCTAssertFalse(FontWatchNotifier.Change.review(status: "flowing").urgente)
    }
    func testRecoveryCopyDescribesAReportInEveryLanguage() {
        for lang in ["ca", "es", "en", "fr", "it", "pt", "gl", "eu"] {
            let (_, body) = PushCopy.fontUpdate(code: "recovered:flowing", fontName: "Font", lang: lang)
            XCTAssertFalse(body.isEmpty)
            XCTAssertNotEqual(body, PushCopy.fontUpdate(code: "review:flowing", fontName: "Font", lang: lang).1)
        }
    }
}
