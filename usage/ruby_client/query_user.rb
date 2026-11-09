require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

# QUERY /user (send the search criteria in the body)
def query_users(name: nil)
  Comatype::C.query(QueryUser::ENDPOINT, body: { name: name })
end
