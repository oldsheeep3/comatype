require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

def register_options_user(server)
  server.options(OptionsUser::ENDPOINT) do |_req|
    # No body; return only the Allow header
    OptionsUser::S200.new(headers: { allow: %w[GET POST OPTIONS] })
  end
end
