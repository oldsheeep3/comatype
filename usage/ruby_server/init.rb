# Server init file: pass the implemented wrappers. The cookie settings (name, httpOnly, etc.) are in init.comat
require "comatype"
require_relative "comatype_gen/all"
require_relative "wrappers/auth"

def init_comatype(server)
  # With the generated Init.wrappers, a missing wrapper declared in init.comat raises ArgumentError
  server.init(ComatypeGen::Init.wrappers(auth: AUTH))
end
