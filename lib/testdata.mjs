import * as fs from "node:fs";
import * as path from "node:path";

// FIXME: This uses `\n` but we need files with `\r\n` and mixed; they won't
// survive git, though.
export const refTextFile_name = 'test-data/file.txt',
refTextFile_basename = path.basename( refTextFile_name ),
refTextFile_fullPath = path.resolve( refTextFile_name ),
refTextFile_buffer = fs.readFileSync( refTextFile_name ),
refTextFile_text = refTextFile_buffer.toString(),
refTextFile_size = refTextFile_buffer.length,
refTextFile_lastModified = fs.statSync( refTextFile_fullPath ).mtimeMs;

export const  
refMissingFile_name  = "test-data/no-such-file.txt",
refMissingFile_fullPath  = path.resolve(  refMissingFile_name ),
refMissingFile_type = 'text/plain',
refMissingFileExtless_name = "test-data/no-such-file"; 

export const 
refUrl_name = "http://example.com",
refUrl_text = fs.readFileSync( 'test-data/example.com.html' ).toString( );
  
export const  
refJsonFile_name  = "test-data/dummy-package/package.json",
refJsonFile_basename  = path.basename(  "test-data/dummy-package/package.json" ),
refJsonFile_fullPath  = path.resolve(  "test-data/dummy-package/package.json" ),
refJsonFile_buffer = fs.readFileSync( refJsonFile_name ), 
refJsonFile_text = refJsonFile_buffer.toString(), 
refJsonFile_value = JSON.parse( refJsonFile_text ),
refJsonFile_size = refJsonFile_buffer.length,
refJsonFile_lastModified = fs.statSync( refJsonFile_fullPath ).mtimeMs


export const 
refTemplateFile_name = "test-data/template.txt",
refTemplateParamsFile_name = "test-data/template.json";
 

/* 2024_5_28: Do these matter? Or should we trust the above? */
if ( refTextFile_size !== 446 ) {
    throw new TypeError( `Reference text file should have size 446 ${refTextFile_size} ` );
}
if ( refJsonFile_size !== 136 ) {
    throw new TypeError( `Reference json file should have size 112 ${refJsonFile_size} ` );
}

// 2024_9_27: The `dir` tests need this file to create. And it's definitely should
// test an empty directory. But the version control systems won't accept manage one.
// So create it.
fs.mkdirSync( "test-data/dummy-package/child-dir", {recursive: true} );

// 2024_9_27: Again, the `dir` tests need fixed dates and we can't rely on version
// control ssytems to set them.
for ( let [path,time] of Object.entries( {
    "test-data/dir/file.bin": Date.parse( "2022-09-06T13:22" ),
    "test-data/dir/subdir": Date.parse( "2022-09-06T13:24" ),
    "test-data/dir/subdir/four.bin": Date.parse( "2022-09-06T13:24" ),
    "test-data/dir/subdir/twenty.bin": Date.parse( "2022-09-06T13:24" ) 
} )  ) {
    time/=1000; // Must be in seconds!
    fs.utimesSync( path, time, time );
}

