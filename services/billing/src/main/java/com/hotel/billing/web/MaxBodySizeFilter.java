package com.hotel.billing.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hotel.billing.util.Messages;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

// MAX_BODY_BYTES is the one request-body ceiling this service declares
// (LLD section 29.1, NFR-BND-2): a code constant, never configuration.
//
// The filter sits ahead of dispatch because Spring resolves the
// controller's @RequestBody argument before requireToken runs, so no
// controller-level check can precede Jackson (LLD section 29.1,
// AC-BND-1). A declared content-length above the ceiling is refused
// before the first read; otherwise the body is buffered up to the
// ceiling and a surplus refuses at byte 65 537, so the surplus is never
// accumulated in full. The refusal is the shared envelope
// (LLD section 29.2): one complete JSON answer, no partial write.
@Component
public class MaxBodySizeFilter extends OncePerRequestFilter {

  public static final int MAX_BODY_BYTES = 65536;

  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (request.getContentLengthLong() > MAX_BODY_BYTES) {
      refuse(response);
      return;
    }
    byte[] body = readAtMost(request.getInputStream(), MAX_BODY_BYTES + 1);
    if (body.length > MAX_BODY_BYTES) {
      refuse(response);
      return;
    }
    chain.doFilter(new BoundedBodyRequest(request, body), response);
  }

  private static byte[] readAtMost(ServletInputStream in, int limit) throws IOException {
    return in.readNBytes(limit);
  }

  private static void refuse(HttpServletResponse response) throws IOException {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("code", "VALIDATION_FAILED");
    body.put("message", Messages.text("error.transport.body_too_large", Map.of()));
    body.put("details", Map.of("field", "body"));
    body.put("traceId", UUID.randomUUID().toString());
    response.setStatus(400);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    response.setCharacterEncoding(StandardCharsets.UTF_8.name());
    // The surplus is never drained in full: Tomcat's
    // max-swallow-size bounds the discard and a larger surplus closes
    // the connection (LLD section 29.2).
    response.setHeader("Connection", "close");
    response.getWriter().write(MAPPER.writeValueAsString(body));
  }

  // The bounded stream Spring binds @RequestBody from: exactly the
  // bytes read under the ceiling, never the raw surplus.
  private static final class BoundedBodyRequest extends HttpServletRequestWrapper {

    private final byte[] body;

    BoundedBodyRequest(HttpServletRequest request, byte[] body) {
      super(request);
      this.body = body;
    }

    @Override
    public ServletInputStream getInputStream() {
      ByteArrayInputStream in = new ByteArrayInputStream(body);
      return new ServletInputStream() {
        @Override
        public int read() {
          return in.read();
        }

        @Override
        public int read(byte[] buffer, int offset, int length) {
          return in.read(buffer, offset, length);
        }

        @Override
        public boolean isFinished() {
          return in.available() == 0;
        }

        @Override
        public boolean isReady() {
          return true;
        }

        @Override
        public void setReadListener(ReadListener listener) {
          throw new UnsupportedOperationException("bounded body is read synchronously");
        }
      };
    }

    @Override
    public BufferedReader getReader() {
      return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
    }

    @Override
    public int getContentLength() {
      return body.length;
    }

    @Override
    public long getContentLengthLong() {
      return body.length;
    }
  }
}
