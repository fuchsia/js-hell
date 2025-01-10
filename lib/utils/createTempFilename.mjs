import {existsSync,unlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import * as path from "node:path";

export function _createTempFilename( prefix, ext = ".tmp" )
    {
        const pathPrefix = path.join( tmpdir(), prefix );
        for ( ;; ) {
            const id = Math.trunc( Math.random() * 999_999_999 ),
                  filename = `${pathPrefix}-${id.toString( ).padStart( 9, '0' )}${ext}`;
            if ( !existsSync( filename ) )
                return filename;
        }
    }

export default function createTempFilename( prefix, callback )
    {
        const filename = _createTempFilename( prefix );
        try {
            callback( filename );
        } finally {
            try {
                unlinkSync( filename );
            } catch {
            }
        }
    }
export async function createAsyncTempFilename( prefix, ext, callback )
    {
        const filename = _createTempFilename( prefix, ext );
        try {
            await callback( filename );
        } finally {
            try {
                unlinkSync( filename );
            } catch {
            }
        }
    }
