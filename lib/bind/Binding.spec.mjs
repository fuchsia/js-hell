import Instr from "../Instr.mjs";
import Binding from "./Binding.mjs";
import StartsWith from "../utils/StartsWith.mjs";


describe( "Binding should", () => {
    it( "spot all defaulted global arguments [DEFAULT-VALUE]", () => {
        const binding = Binding.from( "default( myZero = 0, myText = 'text', myTrue = true, myFalse = false, myUndefined = undefined )" );
        expect( Array.from( binding.globalsWithLiteralDefaults() ) )
        .toEqual( Object.entries( {
            myZero: 0,
            myText: 'text',
            myTrue: true,
            myFalse: false,
            myUndefined: undefined
        } ) );
    } );
    it( "spot all defaulted properties [DEFAULT-PROP]", () => {
        const binding = Binding.from( "default( {wibble = 'wobble'} )" );
        expect( Array.from( binding.globalsWithLiteralDefaults() ) )
        .toEqual( Object.entries( {
            wibble: 'wobble',
        } ) );
    } );
    it( "cope with a defauled variable that's defaulted identically multiple times [DEFAULT-MULTI]", () => {
        const binding = Binding.from( "default( value = 1234, value = 1234 )" );
        expect( Array.from( binding.globalsWithLiteralDefaults() ) )
        .toEqual( Object.entries( {
            value: 1234,
        } ) );
    } );
    it( "ignore a variable that's defaulted to different values [DEFAULT-DIFFER]", () => {
        const binding = Binding.from( "default( random = 10, random = 10, random = 12 )" );
        expect( Array.from( binding.globalsWithLiteralDefaults() ) )
        .toEqual( Object.entries( {
        } ) );
    } );
    it( "to throw if a variable is defaulted to an object [DEFAULT-COMPLEX]", () => {
        expect( () => Binding.from( "default( thing = new Thing )" ) )
        .toThrowError( StartsWith( 'expected literal' ) );
    } );
    it( "to throw if a variable that's defaulted to another variable [DEFAULT-ALIAS]", () => {
        expect( () => Binding.from( "default( foo = bar )" ) )
        .toThrowError( StartsWith( 'expected literal' ) );
    } );
    it( "identify literals", () => {
        expect( Binding.from( "with() true" ).isLiteral() ).toEqual( true );
        expect( Binding.from( "with() 'hello'" ).isLiteral() ).toEqual( true );
        expect( Binding.from( "with() 4" ).isLiteral() ).toEqual( true );
    } );
    it( "not identify a non-literal as a literal", () => {
        expect( Binding.from( "with() thing()" ).isLiteral() ).toEqual( false );
        expect( Binding.from( "with() some.thing()" ).isLiteral() ).toEqual( false );
    } );
} );

