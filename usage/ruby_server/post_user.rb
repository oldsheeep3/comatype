require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

def register_post_user(server)
  server.post(PostUser::ENDPOINT) do |req|
    # req.body: PostUser::Body (no uid). The server decides uid
    PostUser::S200.new(Db::User.create(req.body.name, req.body.email, req.body.phone))
  end
end
