import XCTest
@testable import App

/// El buscador es el punto público más barato de atacar: un ILIKE con una cadena
/// enorme cuesta segundos de CPU de base de datos por petición.
final class SearchHardeningTests: XCTestCase {
    func testTermIsCapped() {
        let largo = String(repeating: "a", count: 50_000)
        let patron = SearchTerm.likePattern(largo)
        // +2 por los comodines que envuelven el término.
        XCTAssertEqual(patron?.count, SearchTerm.maxLength + 2)
    }

    func testWildcardsAreEscaped() {
        // Sin escapar, buscar "%" devolvía la tabla entera.
        XCTAssertEqual(SearchTerm.likePattern("%"), "%\\%%")
        XCTAssertEqual(SearchTerm.likePattern("_"), "%\\_%")
        // La barra invertida se escapa primero: si no, se escaparían las que añadimos.
        XCTAssertEqual(SearchTerm.likePattern("\\"), "%\\\\%")
        XCTAssertEqual(SearchTerm.likePattern("50%"), "%50\\%%")
    }

    func testEmptyTermsAreIgnored() {
        XCTAssertNil(SearchTerm.likePattern(""))
        XCTAssertNil(SearchTerm.likePattern("   "))
    }

    func testNormalTermIsUntouched() {
        XCTAssertEqual(SearchTerm.likePattern("  Font de la Quintana "), "%Font de la Quintana%")
    }
}
