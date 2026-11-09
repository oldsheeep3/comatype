// Implement a wrapper as a suspend function value (CWrap) (corresponds to the `wrapper auth` of init.comat)
import comatype.ktx.CWrap

val auth: CWrap = { req, next ->
    req.headers.set("Authorization", "Bearer " + System.getenv("API_TOKEN"))
    next(req)
}
