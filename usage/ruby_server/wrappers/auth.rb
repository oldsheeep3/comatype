# A wrapper is implemented as a lambda taking (req, nxt) (corresponds to the `wrapper auth` of init.comat)
require_relative "../comatype_gen/all"

AUTH = lambda do |req, nxt|
  user = verify_session(req.cookie("session")) # the app's own logic
  next ComatypeGen::Init.s401(ComatypeGen::Types::ApiError.new(code: "unauthorized", message: "login required")) unless user

  # On endpoints with `wrap auth` on, a handler can read req.ctx[:auth].user
  req.ctx[:auth] = ComatypeGen::Init::AuthCtx.new(user: user)
  nxt.call(req)
end
