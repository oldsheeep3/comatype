import comatype.S
import comatype.gen.*
import comatype.ktx.*

fun S.optionsUser() {
    coOptions(OptionsUser.ENDPOINT) { _ ->
        // No body; return only the Allow header
        S.Reply.of<OptionsUser.Response>(OptionsUser.S200(OptionsUser.S200Headers(allow = listOf("GET", "POST", "OPTIONS"))))
    }
}
