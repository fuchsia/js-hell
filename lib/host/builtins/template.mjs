import Binding from "../../bind/Binding.mjs";

// This is a candidate for [[--input=](JSON|FILE)] - assign the first positional
// to input, if present. When omitted use stdin; so you can write `json src | template some-file`
// rather than `json src | template - some-file`
export const js_hell = `IDL=1
    -- Treat TEMPLATE_FILE as a template literal and output it. 
    -- JSON|FILE is used to populate the global namespace (i.e. provides the execution context - like a \`with\` statement. 
    template 
        (JSON|FILE) 
        TEMPLATE_FILE  
    :: default( $1, $2.toText() ) as String`;

export default function
template( context, text ) {
    // Can we not do an `as dictionary` cast, or something in the IDL?
    if ( typeof context !== 'object' || Array.isArray( context ) )
        throw new Error( "$1 must be a plain object (a 'dictionary')" );
    const binding = Binding.fromTemplateContents( text );
    return binding.exec( new Map( Object.entries( context ) ), {} );
}   