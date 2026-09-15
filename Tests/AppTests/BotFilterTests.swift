import XCTVapor
@testable import App

/// El filtro de bots del ingest de analítica. Pura: dado un user-agent, decide si cuenta.
/// Vive aquí porque el fallo es silencioso —un crawler mal clasificado no rompe nada,
/// solo infla el número— y ya nos costó una lectura en producción descubrirlo.
final class BotFilterTests: XCTestCase {
    func testNavegadoresRealesCuentan() {
        // UA reales de Safari iOS, Chrome Android y Chrome/Firefox de escritorio.
        let humanos = [
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
        ]
        for ua in humanos {
            XCTAssertFalse(InteractionAnalyticsController.looksLikeBot(ua), ua)
        }
    }

    func testBotsSeDescartan() {
        let bots = [
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
            "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)",
            "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
            "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
            "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
            "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
            "python-requests/2.31.0",
            "curl/8.4.0",
            "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
            "WhatsApp/2.23.20.0",
        ]
        for ua in bots {
            XCTAssertTrue(InteractionAnalyticsController.looksLikeBot(ua), ua)
        }
    }

    func testSinUserAgentNoCuenta() {
        // Un navegador siempre manda UA; su ausencia es un script.
        XCTAssertTrue(InteractionAnalyticsController.looksLikeBot(nil))
        XCTAssertTrue(InteractionAnalyticsController.looksLikeBot(""))
    }
}
