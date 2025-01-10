
/// @brief Take a string in kebab case and turn it into camel case.
export function 
fromKebabCase( str )
    {
        return str.replaceAll(  /-[a-z]/g, t => t.charAt(1).toUpperCase() );
    }

export function 
fromSnakeCase( str )
    {
        return str.replaceAll(  /_[a-z]/g, t => t.charAt(1).toUpperCase() );
    }

export function 
toSnakeCase( str )
    {
        // This converts `HTMLImageElement` to HTML_IMAGE_ELEMENT and `createObjectURL` to `CREATE_OBJECT_URL` 
        //  `someHTMLThing` to `SOME_HTML_THING` and `SomeThing` to `SOME_THING` (should be test cases.) 
        // But `HTMLLIElement` or `HTMLIFrameElement` or `HTMLDListElement` will be butchered.
        return str.replaceAll(  /(?:(?<=[a-z])[A-Z]|(?<=[A-Z])[A-Z](?=[a-z]))/g, t => (  
            '_' + t 
        ) ).toUpperCase();
    }

export function 
toKebabCase( str )
    {
        // This converts `HTMLImageElement` to html-image-element and `createObjectURL` to `create-obect-url` 
        //  `someHTMLThing` to `some-html-thing` and `SomeThing` to `some-thing` (should be test cases.) 
        // But `HTMLLIElement` or `HTMLIFrameElement` or `HTMLDListElement` will be butchered.
        return str.replaceAll(  /(?:(?<=[a-z])[A-Z]|(?<=[A-Z])[A-Z](?=[a-z]))/g, t => (  
            '-' + t 
        ) ).toLowerCase();
    }