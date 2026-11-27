/**
 * THIS FILE WAS CREATED VIA CODEGEN DO NOT MODIFY {@see http://go/af-codegen}
 * @codegen <<SignedSource::ca1b169612d7c9a9d94689fc7ea0c882>>
 * @codegenCommand yarn build tokens
 */
type TokenValue = string | number | {
    radius: number;
    offset: {
        x: number;
        y: number;
    };
    color: string;
    opacity: number;
    spread?: number;
    inset?: boolean;
}[];
type TokenValueOriginal = string | {
    radius: number;
    offset: {
        x: number;
        y: number;
    };
    color: string;
    opacity: number;
    spread?: number;
    inset?: boolean;
}[];
type TokenAttributes = {
    group: string;
    state: string;
    introduced: string;
    description: string;
    suggest?: string[];
    deprecated?: string;
    replacement?: string;
};
type Token = {
    value: TokenValue;
    filePath: string;
    isSource: boolean;
    attributes: TokenAttributes;
    original: {
        value: TokenValueOriginal;
        attributes: TokenAttributes;
    };
    name: string;
    path: string[];
    cleanName: string;
};
declare const tokens: Token[];
export default tokens;
