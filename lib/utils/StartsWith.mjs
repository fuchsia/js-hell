import RegExp_quote from "./RegExp_quote.mjs";

export default function 
StartsWith( text )
    {
        return new RegExp( `^${RegExp_quote(text)}` )
    }