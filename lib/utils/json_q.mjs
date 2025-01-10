export default function
json_q( strings, ...keys )
{
    let result = strings[0];
    for ( let i = 0; i < keys.length; ++i ) {
        result += JSON.stringify( keys[i] ) + strings[i+1];
    }
    return result;
}