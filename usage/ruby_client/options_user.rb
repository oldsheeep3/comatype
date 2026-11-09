require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

# OPTIONS /user (there are no params / search / body, so no arguments)
def options_user
  Comatype::C.options(OptionsUser::ENDPOINT)
end
