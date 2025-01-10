// 2024_11_25: This has probably been superseded by the `log` builtin. Switch the tess that use it to that.
export const js_hell = "IDL=1 log LEVEL_NAME TEXT :: default( $1, $2 )";

export default function( name, text ) {    
    console[name]( text );
}