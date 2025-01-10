import * as path from "node:path";
import {inspect} from "node:util";  
const TAB = "\t";  
// We NEED pick syntax: f => f.{size,lastModified,webkitRelativePath,isDir}
// We want to be able to write API=1 $1=* -- not least because it allows use of exclude.
//
// FIXME: locale should be globally respected. But it's not clear how. 
export const js_hell = `IDL=1
    dir [(FILE|DIR)...] 
    :: default( 
        *( $1 ?? cwd.glob( "*", { exclude } ) ).map( f => ({f.size,f.lastModified,f.webkitRelativePath,f.isDirectory}) )
        ,{
            @option lastModified = true, 
            @option size = true, 
            @option summary = true, 
            useColor: @option color = true, 
            @option dirs = true,
            locale: (@option(Str) locale) ?? undefined 
        }
    ) as *String`;
                
export default function* (iterator,
    {lastModified: showLastModified=true,size: showSize=true,summary: showSummary=true, useColor=true,dirs=true,locale} = {})
{
    // 2024_9_27: 
    // `locale` is purely for tests. node seems to respect the `LANG` environment variable, from unix.
    // I just can't see how to set the default for tests! 
    const formatter = new Intl.DateTimeFormat( locale, {
        dateStyle: 'short',
        timeStyle: 'short'
    } );
    const Date_toString = formatter.resolvedOptions().locale === 'en-GB' ? dateValue => formatter.format( dateValue ).replace( ',', '' )
                                                                         : dateValue => formatter.format( dateValue );
    const numFormat = new Intl.NumberFormat;
    const Size_toString = size => numFormat.format( size );
    let total = 0, items = 0;
    const strong = useColor ? `\x1b[${inspect.colors.whiteBright[0]}m` : '',
          faint = useColor ? `\x1b[${inspect.colors.gray[0]}m` : '', 
          reset = useColor ? `\x1b[${inspect.colors.reset[0]}m`: '';
    for ( const {size,webkitRelativePath,lastModified,isDirectory} of iterator ) {
        if ( !dirs && isDirectory ) 
            continue;
        let result = isDirectory ? strong : '';
        if ( showLastModified ) 
            result += Date_toString(lastModified ) + TAB;
        if ( showSize ) { 
            result += ( isDirectory ? ' ' : Size_toString( size ) ) + TAB;
            total += isDirectory ? 0 : size;
        }
        if ( isDirectory ) {
            result += webkitRelativePath;   
        } else {
            const {dir,base} = path.parse( webkitRelativePath );
            result += `${faint}${dir}${dir?path.sep:''}${reset}${base}`;
        }
        result += reset;
        yield result;
        ++items;
    }
    // Should we include the size if showsize false? 
    if ( showSummary )  
        yield showSize ? `Total: ${items} files; ${Size_toString(total )} bytes` : `Total: ${items} files`;
}



