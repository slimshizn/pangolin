import { NextRequest, NextResponse } from 'next/server';
import { build } from '@server/build';

export function middleware(request: NextRequest) {
    // If build is OSS, block access to private routes
    if (build === 'oss') {
        const pathname = request.nextUrl.pathname;
        
        // Define private route patterns that should be blocked in OSS build
        const privateRoutes = [
            '/settings/billing',
            '/settings/remote-exit-nodes',
            '/settings/idp',
            '/auth/org'
        ];
        
        // Check if current path matches any private route pattern
        const isPrivateRoute = privateRoutes.some(route => 
            pathname.includes(route)
        );
        
        if (isPrivateRoute) {
            // Return 404 to make it seem like the route doesn't exist
            return new NextResponse(null, { status: 404 });
        }
    }
    
    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};