import {readFileSync} from "node:fs";
import Idl from "./Idl.mjs";
import Dir from "./types/Dir.mjs";
// import Stream from "./types/Stream.mjs";
import FileSync from "./types/FileSync.mjs";
import {inferFormat,FORMAT_CUSTOM_TO_STRING,FORMAT_JSON,FORMAT_OBJECT,FORMAT_LINES,FORMAT_BYTES} from "./formatOutput.mjs";
import {createAsyncTempFilename} from "./utils/createTempFilename.mjs";
import {BufferReceiver,setOutput2} from "./host/TopicWrapper.mjs";
import {getOutputFormatParams} from "./Idl.mjs";

function getOutput( source, format = '', typeAssertion = '' ) {
    const output = new BufferReceiver;
    const idl = new Idl( `IDL=1 cmd :: default() ${typeAssertion ? `as ${typeAssertion}` :''} ` ) 
    const dictionary = {
        // This is the exact same receiver as set FileBuffer uses.
        output,
        EOL: "\n",
        SCREEN_COLUMNS: 80,
        ...format ? { outputFormat: format } : {},   
    }
    const formatParams = getOutputFormatParams( dictionary );
    setOutput2( formatParams, idl.getResultType(), source );
    return output.getContentAsBuffer().toString();
}

// 2022_10_24: a test on `resolve dir` also validates the object outputting.

describe( "output formatting", () => {
    it( "should be able to to turn text to hex", async () => {
        expect( await getOutput( "hello", "hex", 'Str' ) ).toEqual( "68656c6c6f" )
    } );
    it( "should be able to to turn text to base64", async () => {
        expect( await getOutput( "hello", "base64", 'Str' ) ).toEqual( "aGVsbG8=" )
    } );
    it( "should be able to to output a Dir", async () => {
        const res = await getOutput( new Dir( "test-data/dir" ), "", '' );
        expect( res ).toEqual( "test-data/dir" );
    } );
    it( "should be able to to output a list of strings as json", async () => {
        const res = await getOutput( ["hello","world"], "json0", 'Str[]' );
        expect( res ).toEqual( JSON.stringify( ["hello","world"],undefined, 0 ) );
    } );
    it( "should be able to to output a list of strings as lines", async () => {
        const res = await getOutput( ["hello","world"], "", 'Str[]' );
        expect( res ).toEqual( "hello\nworld" );
    } );
} );

describe( "infer format should", () => {
    it( "output a plain object as object", () => {
        expect( inferFormat( {} ) ).toEqual( FORMAT_OBJECT );
    } );
    // 2023_2_15: This is the historical behaviour; I don't know anybody who depends on it.
    // Should we have FORMAT_EMPTY_ARRAY? Convertable to JSON. Output as nothing otherwise?
    it( "output an empty array as lines", () => {
        expect( inferFormat( [] ) ).toEqual( FORMAT_LINES );
    } );
    it( "output an array as object", () => {
        expect( inferFormat( ["hello", 4] ) ).toEqual( FORMAT_OBJECT );
    } );
    it( "output an array as object", () => {
        expect( inferFormat( [200,0,4] ) ).toEqual( FORMAT_BYTES );
    } );
    it( "output an array of text as lines", () => {
        expect( inferFormat( ["hello", "world"] ) ).toEqual( FORMAT_LINES );
    } );
    it( "output an object with `toJSON()` as json", () => {
        expect( inferFormat( {toJSON:function(){}} ) ).toEqual( FORMAT_JSON );
    } );
    it( "output an object with `toString()` as String", () => {
        expect( inferFormat( { toString:()=>""} ) ).toEqual( FORMAT_CUSTOM_TO_STRING );
    } );
} );


it( "should be able to turn *String into a file", async () => {
     // 2023_2_11: FIXME: I think we should be able to use --output=-, and avoid a temp file.
     // Maybe I've forgotten how to do it via instantiation?
     await createAsyncTempFilename( "jshell-format-output", ".txt", async filename => { 
        const idl = new Idl( `IDL=1 cmd :: default() as *String` ); 
        const _rawDictionary = {
             output: new FileSync( filename ),
             EOL: "\n",
             SCREEN_COLUMNS: 80
        }
        // `idl` is needed for `idl.getResultType()` Otherwise everything else can be done in the outputter.     
        await setOutput2( getOutputFormatParams(_rawDictionary ), idl.getResultType(), function*(){ yield "hello"; yield "world"}(), _rawDictionary );
        expect( readFileSync( filename ).toString() ).toEqual( "hello\nworld" );
     } );
} );

