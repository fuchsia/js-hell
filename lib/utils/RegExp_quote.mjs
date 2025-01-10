export default function
RegExp_quote( text ) {
    return text.replaceAll( /[*.+?|^$\[\](){}\\]/g, $1 => '\\' + $1 );
} 