require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

def register_user_post_login(server)
  server.post(UserPostLogin::ENDPOINT) do |req|
    uid = Db::User.verify(req.body.email, req.body.password) # the app's own logic
    next UserPostLogin::S401.new(Types::ApiError.new(code: "bad", message: "wrong")) unless uid

    # Issue a Set-Cookie with the cookie settings of init.comat (httpOnly etc.)
    UserPostLogin::S200.new(UserPostLogin::S200Res.new(uid: uid)).with_cookie(new_session(uid), max_age: 3600)
  end
end
