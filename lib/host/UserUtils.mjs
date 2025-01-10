// import * as readline from 'node:readline';
import {readSync} from "node:fs";
// 2024_10_15: StyleText is introduced in 20.12/21.7 (and I'm trying to use it on Glitch which is node 16.x, FFS).
// Lack of it is not fatal, so degrade gracefully.
import * as NodeUtil from "node:util";
const {styleText = (style,text) => text} = NodeUtil;
// FIXME: if style text is missing, do it ourselves.
// FIXME: check we are a colour-capable TTY.
const printBold = text => process.stdout.write( styleText( ['bold'], text ) );  

function
checkReadline() {
    if ( !process.stdout.isTTY || !process.stdin.isTTY ) {
        throw new Error( "Cannot readline (not a terminal)" );
    }
}

function 
readline( ) {
    // This is the only synchronous way I can see to read a line - argghhh!!!
    //
    // We set the terminal to cooked mode: that means when we ask for data
    // the tty will read a whole line, with whatever line handling the terminals 
    // supplies.
    //
    // We then have to read it char-by-char until we find the eol.
    const char = Buffer.alloc( 1 );
    process.stdin.setRawMode( false );
    let result = '';
    for ( ;; ) {
        readSync( process.stdin.fd, char );
        if ( char[0] === 13 )
            break;
        result += char.toString();
    };
    return result;
}

export function 
prompt( prompt = "Enter a value:", defaultText ) {
    checkReadline();

    if ( prompt.trimEnd() === prompt ) {
        prompt += ' ';
    }
    printBold( prompt );
    // Q. Should we print, in dark, the defaultText, and then go back?
    // (And supply the default text if we get an empty line? )
    // A. If we were to do that, we should hide the text as soon as the
    // user types something that disagrees with it. And there's no
    // way to do that as we have the term in cooked mode. The best we could
    // do would be put the default in square brackets.
    return readline();
}

export function 
confirm( confirm ) {
    checkReadline();

    // We could be a lor more sophisticated here: place the cursor, over one
    // option (highlighting it) and then allow Y/N/y/n to select, as well as
    // tabs and arrows.
    printBold( confirm + ' [Y]es/[N]o? ' );
    const result = readline();
    process.stdout.write( '\r\n' );
    // Likewise, this could be a lot more sophsiticated... 
    return result.trimStart().toLowerCase().startsWith( 'y' );
}

export function 
alert( message = "Press any key..." ) {
    checkReadline();
    // We could be a lor more sophisticated here: place the cursor, over one
    // option (highlighting it) and then allow Y/N/y/n to select, as well as
    // tabs and arrows.
    printBold( message );
    const char = Buffer.alloc( 1 );
    process.stdin.setRawMode( true );
    readSync( process.stdin.fd, char );
    process.stdout.write( '\r\n' );
    return;
}



