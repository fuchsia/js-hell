import { fileURLToPath } from 'node:url';
import {readFileSync as Fs_readFileSync} from "node:fs";
import {realiseTo} from "../symbols.mjs";

const platformFetch = globalThis.fetch;

function
fetchBuffer( buffer )
    {
        // Apparently this works.
        return new Response(
            // A Blob is legal here, as is a readable stream...
            // There's no way to set the URL.
            buffer, {
                status: 200,
                statusText: "OK",
            }
         );
    }

export default function 
ourFetch( url, options )
    {
        // 2022_10_13: There is no way to pass a File to us intact; it realises
        // as a buffer so, for the time being, we handle a buffer.
        if ( Buffer.isBuffer( url ) ) 
            return fetchBuffer( url );
        
        const u = new URL( url );
        if ( u.protocol.toLowerCase() === 'file:' ) {
            return fetchBuffer( Fs_readFileSync( fileURLToPath( u ) ) );
        } else {
            return platformFetch( url, options );
        }
    }
// 2024_5_22: It would make more sense to allow this, than to allow patch fetch.
ourFetch[realiseTo] = ourFetch;