import {AS_SCALAR,AS_ARRAY} from "../bind/consts.mjs";
import BoundOutputter from "../bind/Outputter.mjs";
import FileSync from "../types/FileSync.mjs";
import {mimetype,MIME_JSON,MIME_TEXT} from "../formatOutput.mjs";

export class 
BufferReceiver {
    #buffer;

    /// @brief This is used to set the buffer by the output formatter - i.e. is the input to the pipe.
    setValueAsBuffer( buffer ) {
        this.#buffer = buffer;
    }

    /// @brief This is read from to get the pipe; i.e. is the output of the pipe.
    getContentAsBuffer() {
        return this.#buffer;
    }
}

function
setOutput3( receiver, formatParams, resultType, value ) {
    const returnValueReceiver = new BoundOutputter( receiver, resultType, formatParams );
    returnValueReceiver.setValue( value ); 
}

export function
setOutput2( formatParams, resultType, value ) {
    // Remember formatParams.output has already been instanced to a file, so has a 
    // setValueAsBuffer method.
    setOutput3( formatParams.output, formatParams, resultType, value );
}

/// @brief This creates a file-like interface necessary to pipe into
/// a command or replace '-'.
export function 
createTopicWrapper2( outputFormatParams, topicTypeHint, topic ) {
    // FIXME: we need a mimetype. text/plain and application/json should both be on the table.
    const {basetype:topicType = 'unknown',enum:topicEnum = "unknown"} = topicTypeHint ?? {};
    const type = mimetype( topicTypeHint, outputFormatParams, topic );
    const f = new FileSync( "stdin", "/dev", undefined, type, () => {
        const receiver = new BufferReceiver;
        setOutput3( receiver, outputFormatParams, topicTypeHint, topic ); 
        return receiver.getContentAsBuffer(); 
    } );
    
    if ( mimetype === MIME_TEXT ) {
        f.toText = () => topic;
        f.text = async () => topic;
    } else if ( mimetype === MIME_JSON ) {
        // Should this be true for all?
        f.toText = () => JSON.stringify( topic );
        f.text = async () => JSON.stringify( topic );
        // Should we se the realiseAs param to `JSON`?
        // Should the file itself do this?
    }
    // 2024_8_5: If we don't add these, the buffer created above
    // may well fail `JSON.parse()` (e.g. a string won't be quoted.) 
    // But we risk passing through things that aren't JSON. In the end,
    // is calling `JSON.parse(JSON.stringify())` the right solution -
    // as validating it will be almost as slow. (Should we strcuralCloen?)
    //
    // Is there a wider question here. Should calling `toJSON()` on a `text/plain` file
    // ALWAYS result in a string, not an error (at least on text/plain?) 
    f.json = async () => topic;
    f.toJSON = () => topic;
    return f;
}


