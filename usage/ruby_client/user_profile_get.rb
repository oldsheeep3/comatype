require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

# GET /user/profile (wrap auth is on, so 401 without login)
def get_profile
  Comatype::C.get(UserProfileGet::ENDPOINT)
end
