import * as CamelCase from "./CamelCase.mjs";

describe( "CamelCase.toSnakeCase should", () => {
    const tests = {
        "HTMLImageElement": "HTML_IMAGE_ELEMENT",
        "createObjectURL": "CREATE_OBJECT_URL",
        "ClassName": "CLASS_NAME",
        "Name": "NAME",
        "someHTMLThing": "SOME_HTML_THING",
        "nowt": "NOWT",
    }
    for ( const [from,to] of Object.entries( tests ) ) {
        it ( `handle ${from}`, () => {    
            expect( CamelCase.toSnakeCase( from ) ).toEqual( to );
        } );
    }
} );