import Fluent
import Vapor

/// Una insignia **especial** concedida a alguien: un hecho, no un cálculo.
///
/// ## Por qué esto existe si ya hay 21 familias de insignias
///
/// Las 21 familias de `ContributionScore.badgeFamilies` no se guardan en ninguna parte: se
/// derivan del recuento cada vez que alguien mira. Es lo correcto para ellas —«has puesto
/// 25 primeras fotos» es cierto o no lo es, y si borras una reseña deja de serlo— y tiene
/// la ventaja de que no hay estado que se desincronice.
///
/// Las especiales no pueden funcionar así, y una de las dos lo demuestra sola:
/// **«Betatester» es de las 100 primeras personas que llegan a 15 reseñas**. Eso no es una
/// propiedad de nadie, es una carrera. Si se recalculara, el orden podría cambiar al
/// reescribir el histórico con `--rescore` y una medalla ya enseñada desaparecería del
/// perfil de alguien para aparecer en el de otro. Una insignia que se puede perder porque
/// hemos cambiado el baremo no es una insignia.
///
/// Por eso las especiales se **conceden** y se guardan. Consecuencias, todas queridas:
///
/// - `--rescore` no las toca. Puede reconstruir cada gota y las medallas siguen ahí.
/// - No se revocan. Si mañana borras diez reseñas, sigues habiendo sido de los 100
///   primeros: eso pasó. Es la diferencia entre un contador y un recuerdo.
/// - El cupo se agota de verdad. Cuando se hayan repartido las 100, no quedan.
///
/// El índice único de `(user_id, key)` es lo que hace que conceder sea idempotente, y con
/// eso el barrido puede pasar tantas veces como quiera sin repartir dos veces lo mismo.
final class BadgeAward: Model, @unchecked Sendable {
    static let schema = "badge_awards"

    @ID(key: .id) var id: UUID?
    @Parent(key: "user_id") var user: User

    /// La clave del catálogo (`SpecialBadges.catalogue`). Se guarda la clave y no el
    /// nombre por lo mismo que en el resto de la gamificación: el rótulo lo traduce el
    /// navegador y cambiarlo no debe reescribir la base de datos.
    @Field(key: "key") var key: String

    /// Cuándo se ganó. **No** es cuándo se registró: para las concedidas sobre el
    /// histórico es el momento en que se cumplió la condición, que es el que ordena la
    /// carrera y el que se enseña.
    @Field(key: "earned_at") var earnedAt: Date

    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}

    init(id: UUID? = nil, userID: UUID, key: String, earnedAt: Date) {
        self.id = id
        self.$user.id = userID
        self.key = key
        self.earnedAt = earnedAt
    }
}
