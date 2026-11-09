require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

def register_user_profile_get(server)
  server.get(UserProfileGet::ENDPOINT) do |req|
    # wrap auth is on, so the ctx added by the wrapper is readable
    UserProfileGet::S200.new(req.ctx[:auth].user)
  end
end
