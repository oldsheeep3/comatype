require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

# POST /user/login (on success the server issues a Set-Cookie and the cookie jar keeps it)
def login(email:, password:)
  Comatype::C.post(UserPostLogin::ENDPOINT, body: { email: email, password: password })
end
