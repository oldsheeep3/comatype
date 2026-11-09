require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

def register_query_user(server)
  server.query(QueryUser::ENDPOINT) do |req|
    # QUERY takes the search criteria in the body (req.body.name)
    QueryUser::S200.new(Db::User.search(req.body.name))
  end
end
