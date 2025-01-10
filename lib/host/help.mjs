import Array_accumulate from "../utils/Array_accumulate.mjs";
// FIXME: delcare this/reexport this from somewhere sensible (stringify?)
import {FILE_TOPIC} from "../args/argtok.mjs";
import {stringifyOptionToParts} from "../usage/stringify.mjs";
import helpIndex from "./help-index.mjs";
import HOST_OPTIONS from "./hostOptions.mjs";


const HELPSTYLE_GNU = 'gnu',
      HELPSTYLE_HG = 'hg';

const INDENT = '   ';


function
wrap( text, EOL = '\n' )
{
    if ( typeof text === 'string' ) {
        return text.trim();
    } 
    if ( Array.isArray( text ) ) {
        return Array_accumulate( text, 
            para => para.trim().replaceAll( /\s+\r?\n\s+/g, ' ' ),
            '\n\n'
         );
    }
}

function
stringifyOption(  node, defaultJson ) {
    const parts = stringifyOptionToParts( node, { defaultJson } );
    return Array_accumulate( parts, p => 
        p.value == '(' ? '' :
        p.value == ')' ? '' :
        p.value === '|' ? ' ' :
        p.value
    , '', INDENT ) 
}


/// @brief This is the beginning of rebuilding the usage string.
/// It returns any annotated options as a crude list.
///
/// FIXME: merge with `getDefaults`
/// FIXME: we are messing with the AST. We don't belong here.
function
getDescription( idl, name = idl.name ) {
    // This will become wrap.
    const respace = text => text.replaceAll( /\s*\r?\n\s*/g, ' ' ).trim();
    let usageStr  = name;   // The caller checks whether `idl.name === $0` and sets it to the external name.
    const summary = respace( idl.summary  ); 
    const details = idl.details ? idl.details.map( 
                                    ( para, index ) => respace( para ) 
                                    // lazy hack to get a blank between paras. Because
                                    // the options DON'T want it like this.  
                                    + ( index < idl.details.length - 1? "\n" : "" ) ) 
                                : [];
    const options = []; 
    const isPlatform = option => !option.isInline() && option.platform; 
    const usage = idl.getUsage( HOST_OPTIONS );
    const allOptions = Array.from( usage.enumAllOptions() );
    
    const cliMap = usage.getCliMap();
    let mandatoryOptions = '';
    let hasOptional = false
    let extraOptions = "";
    for ( const option of allOptions  ) {
        if  ( isPlatform( option ) ) {
            // FIXME: if we are verbose, do a full dump.
            if ( extraOptions ) {
                extraOptions += ' ';
            }
            // We assume they are optional, and simple.
            extraOptions += '[' + option.toBareUsage( cliMap )  + ']';
        } else if ( !option.mandatory ) {
            hasOptional = true;
            let text = INDENT + option.toBareUsage( cliMap );
            if ( option.annotation ) {
                text += ': ' + option.annotation;
            }
            if ( typeof option.defaultValue !== 'undefined'  ) {
                if ( typeof option.defaultValue !== 'boolean' )
                    text += ' [DEFAULT: ' + JSON.stringify( option.defaultValue ) + ']';
            } else if ( typeof option.defaultText !== 'undefined' ) {
                if ( typeof option.defaultText !== 'symbol' ) {
                    text += ' [DEFAULT: ' + JSON.stringify( option.defaultText ) + ']' 
                } else if ( option.defaultText === FILE_TOPIC ) {
                    if ( option.key === "input" ) {
                        text += ' [DEFAULT: _stdin_]';
                    } else if ( option.key === "output" ) {
                        text += ' [DEFAULT: _stdout_]';
                    } else {
                        // Assume it will revert to '-'? Throw an error?
                        text += ' [DEFAULT: _file topic_]';
                    }                    
                } 
            } 
            options.push( text );
        } else {
            const bare = option.toBareUsage();
            mandatoryOptions  += ' ' + bare;
            if ( option.annotation ) {
                options.push( INDENT + bare + ': ' + option.annotation );
            }
        }
    }
    if ( hasOptional ) {
        usageStr += " [OPTION]...";
    }
    usageStr += mandatoryOptions;
    usageStr += ' ' + usage.getPostionalString();
    return {usage:usageStr,summary,details,options,defaults: [], extraOptions};
}

function
mergeSections( ...sections) {
    const iterator = sections[Symbol.iterator]();
    // 2024_3_18: This quietly assumes there is 
    //   a) at least one section
    //   b) the first section is non empty.
    // Both jold.
    const result = [ ...iterator.next().value ];
    for ( const lines of iterator ) {
        if ( lines.length ) {
            result.push( '' );
            result.push( ...lines );
        }
    }
    result.push( '' );
    return result;
}

// FIXME: we should return Line[] and leave the code to handle the result.
export default async function
help( idl = null, {helpStyle = HELPSTYLE_HG, SCREEN_COLUMNS: screenColumns = 80,externalName = "$0" } = {} ) {
    let usage, summary, details, extraOptions, defaults;
    if  ( !idl /*|| nameOrIdl === "js-hell"*/ ) {
        // FIXME: we want a scriptlet, or spoof scritplet, that will return all this.
        // So we can just use the below path.
        ({usage,summary,details,defaults} = await helpIndex( screenColumns ));
    } else {
        const r = getDescription( idl, idl.name !== "$0" ? idl.name : externalName );
        usage = r.usage;
        if ( r.summary )
            summary = r.summary;
        else
            summary = '';
        defaults = r.defaults;
        // FIXME: we really want to insert paragraph breaks here. They are hack in above.
        details = [...r.details, ...r.options ];
        extraOptions = r.extraOptions;
    }
    const extraLines = !details ? []
                     : !Array.isArray( details ) ? [details]
                     : details;
    
    if ( !Array.isArray( summary ) )
        summary = summary ? [summary] : [];
    
    let message;
    if ( helpStyle === HELPSTYLE_GNU ) {
        message = [  
            `usage: ${usage}`,
            ...extraOptions ? [ `addtional options: ${extraOptions}` ] : [],
            ...summary,
            ...defaults,
            ...extraLines
        ];
    } else {
        message = mergeSections(   
            [usage],
            summary,
            extraLines, // These are the options
            defaults,   // FIXME: merge in with the above.
            extraOptions ? [ `addtional options: ${extraOptions}` ] : [],
            
        );
    }
    return message;
}
