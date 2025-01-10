import {readFileSync} from "node:fs";
import createTempFilename from "../utils/createTempFilename.mjs";
import FileSync from "./FileSync.mjs";

describe( "FileSync", () => {
    it( "should write a vector", () => {
        createTempFilename(  "js-hell-test", filename => {
            const file = new FileSync( filename );
            file.setValueAsBufferVector( [new Uint8Array( [ 4, 4, 4 ] ), new Uint8Array( [ 5, 5, 5, 5 ] ) ] ); 
            expect( readFileSync( filename ) ).toEqual( Buffer.from( [ 4, 4, 4, 5, 5, 5, 5 ] ) ); 
        } );
    } )
    it( "should stat THEN load", async () => {
        const f = new FileSync('test-data/file.txt')
        expect( f.size ).toEqual( 446 );
        const t = f.text();
        expect( t ).toBeInstanceOf( Promise );
        expect( await t ).toEqual( 
`Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod
tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
commodo consequat. Duis aute irure dolor in reprehenderit in voluptate
velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint
occaecat cupidatat non proident, sunt in culpa qui officia deserunt
mollit anim id est laborum.
`.split( /\r?\n/ ).join( '\n' )

         );
    } );
    it( "should load THEN stat", async () => {
        const f = new FileSync('test-data/file.txt')
        const t = f.text();
        expect( t ).toBeInstanceOf( Promise );
        expect( await t ).toEqual( 
`Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod
tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
commodo consequat. Duis aute irure dolor in reprehenderit in voluptate
velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint
occaecat cupidatat non proident, sunt in culpa qui officia deserunt
mollit anim id est laborum.
`.split( /\r?\n/ ).join( '\n' )

         );
         expect( f.size ).toEqual( 446 );
    } );
});