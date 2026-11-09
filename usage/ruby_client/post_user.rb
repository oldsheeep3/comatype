require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

# POST /user (sign up. The body is a hash keyed by attribute name)
def post_user(name:, email:, phone:)
  Comatype::C.post(PostUser::ENDPOINT, body: { name: name, email: email, phone: phone })
end
