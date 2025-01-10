export const js_hell=`IDL=1
   -- Search for occurences of SEARCH_STR in FILE... 
   findstr SEARCH_STR FILE... :: default($searchStr, *$files.map( f => ({ name: f.webkitRelativePath, data: f.toText()}) )) as *String
`; 

export default function*
findtext( text, files ) {
    FILES: for ( const {name,data} of files ) {
        const lines = data.toString().split( /\r?\n/ );
        LINES: for ( let i = 0; i < lines.length; ++i ) {
            let lastIndex = 0;
            for ( ;; ) {
                const index = lines[i].indexOf( text, lastIndex );
                if ( index === -1 )
                    continue LINES;
                // Ideally we should highlight it in some way. CF https://datatracker.ietf.org/doc/html/rfc1896?
                // Or MD? Or ANSI? 
                yield `${name}:${i+1}.${index}:${lines[i]}`;
                lastIndex = index + text.length;
            }   
        }
    }
}


