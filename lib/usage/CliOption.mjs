
export const 
ARGVALUE_NONE = "none",
ARGVALUE_REQUIRED = "required",
ARGVALUE_OPTIONAL = "optional";

/// @brief `NamedOption` conflates per option-name info and per key info. This contains purely 
/// per option-name info. Use this to build a dictionary of raw values. But not to instantiate
/// them. 
///
/// Q: Should we include whether multiple or not? What about the much vaulted `[--no-exclude|--exclude=STRING...] 
export default class 
CliOption {
    // optionName;    //< The `--xxx` or `-X` name.
    key;           //< The key in the lexical environment.
    arg;           //< One of the ARGVALUE_xxx constants: used to indicate whether this option needs an argument (`--output=FILE`) or not (`--no-output`).
                   // Booleans are `ARGVALUE_NONE`; most others will be `ARGVALUE_REQUIRED`.
                   //
                   // Calling it ARG_ caused problem for parseOptions. VALUE is not greate. Need a better name.
    impliedValue;  //< For `ARG_NONE`/`ARG_OPTIONAL`, this is the instantied value to use if none is supplied; e.g. `true`, `false`, etc...

    constructor( {key,arg,impliedValue} ) {
        Object.assign( this, {key,arg,impliedValue} )
    }

    static fromOption( {key,typename} ) {
        return new CliOption({ 
            key,
            arg: typename === "true" || typename === "false" ? ARGVALUE_NONE : ARGVALUE_REQUIRED,
            impliedValue: typename === "true" ? true : typename === "false" ? false : undefined
        } );
    }
};


