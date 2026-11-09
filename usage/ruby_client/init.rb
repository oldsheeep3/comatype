# Client init file: pass the implemented wrappers
# The base url defaults to baseUrl in init.comat. Override with the COMATYPE_BASE_URL environment variable or base_url:
# Call init_comatype once at startup (whether a wrapper is on or off is decided by defaults.comat and `wrap` in each .comat)
require "comatype"
require_relative "comatype_gen/all"
require_relative "wrappers/auth"

def init_comatype
  Comatype::C.init(
    # With the generated Init.wrappers, a missing wrapper declared in init.comat raises ArgumentError
    wrappers: ComatypeGen::Init.wrappers(auth: AUTH),
    # Used by `cookie on` endpoints. The cookie jar keeps the httpOnly cookie
    cookies: true
  )
end
