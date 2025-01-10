
async function
readStream( readStream )
    {
        const chunks = [];
        for await ( const chunk of readStream ) {
            chunks.push( chunk );
        }
        // At this point we can just become an unnamed file...
        return Buffer.concat( chunks );    
    }

// A lot of conversion can happen on this because of the casting magic.
export default class 
Stream {
    #readStream;
    #writeStream;
    #readBuffer;
   
    constructor( readStream, writeStream )
        {
            // FIXME: the readStream needs to be an fd, so we can read it synchronously
            // to allow it to appear properly in file lists.
            this.#readStream = readStream;
            this.#writeStream = writeStream;
        }
        
    setValueAsBuffer( buffer )
        {
            this.#writeStream.write( buffer );
            // Should we write a closing EOL? cf the scalar madness above? 
        }
    
    setValueAsBufferStream( bufferIterator )
        {
            // We probably should be handling events here; waiting for each to complete
            // and waiting for drain.
            // Should we write a closing EOL after each item?
            for ( const buffer of bufferIterator ) {
                this.#writeStream.write( buffer );
            }
        }

    toStream( )
        {
            return this;
        }

    async fetchValueAsBuffer()
        {
            if ( !this.#readStream )
                throw new TypeError( "Stream not readable" );
            return this.#readBuffer = readStream( this.#readStream );
        }

    // FIXME: this is not toBuffer if it return a Promise.
    toBuffer()
        {
            return this.fetchValueAsBuffer();
        }
        
    async fetchContentAsResponse()
        {
            const buffer = await this.fetchValueAsBuffer();
            // NB Response theoretically supports web streams, so we could use that here.
            return new Response( 
                buffer, {
                    status: 200,
                    statusText: "OK",
                    headers: new Headers 
                } 
             );
        }

};
